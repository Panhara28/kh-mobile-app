import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DateRange } from '@/lib/dates';
import { rangeFor } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { hasActiveFilters, itemCount, LIST_STATUSES, orderActions, orderWhen, searchFilter, servedTypeKey, summarize, SUMMARY_LIMIT, whoFor, type OrderFilter, type OrderRow, type OrderStatus, type SearchType } from '@/lib/orders';
import { useSession } from '@/lib/session';
import { pickSetting } from '@/lib/settings';
import { parseKhPosTime } from '@/lib/time';
import { useBranch } from '@/lib/use-branch';
import { useShift } from '@/lib/use-shift';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { DateRangeBar } from '@/ui/date-range-bar';
import { ScreenHeader } from '@/ui/screen-header';
import { TabBar, TAB_BAR_SPACE } from '@/ui/tab-bar';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 19, 2026" and "2:30 PM" like the web columns. */
function dateAndTime(value: string | null | undefined): { date: string; time: string } {
  const d = parseKhPosTime(value);
  if (!d) return { date: 'N/A', time: '' };
  const h = d.getHours() % 12 || 12;
  return { date: `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`, time: `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}` };
}

/**
 * Customer Order like the kh-pos web page (Order Management): the summary cards of the period, a
 * search by invoice / customer phone (/ ticket code in a cinema), status, "My Shift Only" and date
 * filters, and the order list. Each order can be printed (receipt), viewed, opened (a table draft)
 * or reversed to a draft.
 */
export default function OrdersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const { currency, warehouseId } = useBranch();
  const { shift, reload: reloadShift } = useShift();
  const writer = useRecordWriter();

  const [range, setRange] = useState<DateRange | null>(() => rangeFor('today'));
  const [rangeKey, setRangeKey] = useState(0);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [searchType, setSearchType] = useState<SearchType>('invoice');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [myShift, setMyShift] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [all, setAll] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [busyId, setBusyId] = useState('');
  const request = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    void reloadShift();
  }, [reloadShift]);

  useEffect(() => {
    data.settings(warehouseId).then(
      ({ data: s }) => {
        try {
          setCinema(JSON.parse(pickSetting(s, 'TYPE_POS', warehouseId) ?? '{}').system_type === 'CINEMA');
        } catch {
          setCinema(false);
        }
      },
      () => undefined,
    );
  }, [data, warehouseId]);

  const searching = searchFilter(searchType, query);
  const isSearching = Object.keys(searching).length > 0;
  const shiftId = myShift && shift ? shift.shift_id : undefined;

  const filter = useCallback(
    (offset: number, limit = PAGE): OrderFilter => ({
      limit,
      offset,
      // searching drops the status filter, like the web
      ...(status && !isSearching ? { status } : {}),
      ...searching,
      ...(shiftId ? { shiftId } : {}),
      ...(range ? { startDate: range.start, endDate: range.end } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, query, searchType, shiftId, range, isSearching],
  );

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const f = filter(offset);
      try {
        const r = await data.orders(f);
        if (id !== request.current) return;
        setOrders((prev) => (offset === 0 ? r.data.orders : [...prev, ...r.data.orders.filter((o) => !prev.some((p) => p.orderId === o.orderId))]));
        setTotal(r.data.totalRows);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, filter],
  );

  // The summary cards cover the whole period (not the filters), like the web.
  useEffect(() => {
    let cancelled = false;
    const f: OrderFilter = { limit: SUMMARY_LIMIT, offset: 0, ...(range ? { startDate: range.start, endDate: range.end } : {}) };
    data.orders(f).then(
      (r) => !cancelled && setAll(r.data.orders),
      () => !cancelled && setAll([]),
    );
    return () => {
      cancelled = true;
    };
  }, [data, api, range, state.online, state.syncVersion]);

  const { online, syncVersion } = state;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load(0);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, online, syncVersion]);

  async function refresh() {
    setRefreshing(true);
    await load(0);
    setRefreshing(false);
  }

  async function more() {
    if (moreLoading || orders.length >= total) return;
    setMoreLoading(true);
    await load(orders.length);
    setMoreLoading(false);
  }

  function reset() {
    setStatus('');
    setSearch('');
    setQuery('');
    setMyShift(false);
    setRange(rangeFor('today'));
    setRangeKey((k) => k + 1);
  }

  function view(o: OrderRow, receipt = false) {
    router.push({ pathname: '/order/[id]', params: receipt ? { id: o.orderId, receipt: '1' } : { id: o.orderId } });
  }

  function print(o: OrderRow) {
    void (async () => {
      setBusyId(o.orderId);
      try {
        // the print count is sent at once, or kept on the phone and sent later
        await writer({ entity: 'order-print', op: 'action', recordId: `print:${o.orderId}:${Date.now()}`, method: 'POST', path: `/api/pos/order/${encodeURIComponent(o.orderId)}/print`, body: {}, label: `${t('orders.printReceipt')} #${o.invoiceNo}` });
      } catch {
        // the receipt can still be shown if the count could not be saved
      } finally {
        setBusyId('');
      }
      void load(0);
      view(o, true);
    })();
  }

  function reverse(o: OrderRow) {
    Alert.alert(t('orders.undoTitle', { no: o.invoiceNo }), t('orders.undoWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.undo'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusyId(o.orderId);
            try {
              const how = await writer({ entity: 'order', op: 'action', recordId: `undo:${o.orderId}`, method: 'PUT', path: `/api/pos/order/${encodeURIComponent(o.orderId)}/undo-from-complete-to-draft`, body: {}, once: true, label: `${t('orders.undo')} #${o.invoiceNo}` });
              Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('orders.undone'));
              if (how === 'done' && o.tableNumber) router.push({ pathname: '/table/[id]', params: { id: o.tableNumber } });
              else await load(0);
            } catch (e) {
              Alert.alert(t('orders.undoFailed'), e instanceof Error ? e.message : undefined);
            } finally {
              setBusyId('');
            }
          })(),
      },
    ]);
  }

  const mayOpenTables = can(user, 'restaurant', 'read');
  const sum = summarize(all ?? []);
  const active = hasActiveFilters(filter(0)) && (isSearching || !!status || !!shiftId);
  const placeholder = searchType === 'invoice' ? t('orders.searchInvoice') : searchType === 'phone' ? t('orders.searchPhone') : t('orders.searchTicket');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('orders.title')} right={mayOpenTables ? <Button title={`+ ${t('orders.newOrder')}`} size="sm" onPress={() => router.push('/tables')} /> : undefined} />
      <DateRangeBar key={rangeKey} initial="today" onChange={(r) => setRange(r)} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.byInvoice')} selected={searchType === 'invoice'} onPress={() => setSearchType('invoice')} />
          <Chip label={t('orders.byPhone')} selected={searchType === 'phone'} onPress={() => setSearchType('phone')} />
          {cinema ? <Chip label={t('orders.byTicket')} selected={searchType === 'ticketCode'} onPress={() => setSearchType('ticketCode')} /> : null}
        </ScrollView>
        <Input value={search} onChangeText={setSearch} placeholder={placeholder} keyboardType={searchType === 'phone' ? 'phone-pad' : 'default'} autoCorrect={false} accessibilityLabel={placeholder} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.allStatus')} selected={status === ''} onPress={() => setStatus('')} />
          {LIST_STATUSES.map((s) => (
            <Chip key={s} label={t(`orders.status_${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ScrollView>
        <View style={styles.row}>
          {shift ? (
            <View style={[styles.row, styles.flex]}>
              <Switch value={myShift} onValueChange={setMyShift} accessibilityLabel={t('orders.myShift')} />
              <Text style={styles.body}>{t('orders.myShift')}</Text>
            </View>
          ) : (
            <View style={styles.flex} />
          )}
          {active ? <Button title={t('orders.reset')} variant="outline" size="sm" onPress={reset} /> : null}
        </View>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {loading ? (
        <LoadingState />
      ) : error && orders.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.orderId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <SumCard label={t('orders.completed')} value={formatMoney(sum.completedTotal, currency)} hint={t('orders.count', { count: sum.completedCount })} color={colors.success} />
                <SumCard label={t('orders.draft')} value={formatMoney(sum.draftTotal, currency)} hint={t('orders.count', { count: sum.draftCount })} color={colors.warning} />
              </View>
              <SumCard label={t('orders.expected')} value={formatMoney(sum.expectationTotal, currency)} hint={t('orders.count', { count: sum.expectationCount })} color={colors.info} />
              <View style={styles.summaryRow}>
                {sum.byServedType.map((x) => (
                  <SumCard key={x.servedType} label={t(`orders.served_${servedTypeKey(x.servedType)}`)} value={formatMoney(x.total, currency)} hint={t('orders.count', { count: x.count })} color={colors.foreground} small />
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => <OrderCard order={item} busy={busyId === item.orderId} onPrint={() => print(item)} onView={() => view(item)} onOpen={() => item.tableNumber && router.push({ pathname: '/table/[id]', params: { id: item.tableNumber } })} onReverse={() => reverse(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          onEndReached={() => void more()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EmptyState title={t('orders.noOrders')} />
              <Text style={styles.muted}>{t('orders.noOrdersHint')}</Text>
              {mayOpenTables ? <Button title={t('orders.openPos')} variant="outline" onPress={() => router.push('/tables')} /> : null}
            </View>
          }
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
        />
      )}
      <TabBar current="orders" />
    </SafeAreaView>
  );
}

function SumCard({ label, value, hint, color, small }: { label: string; value: string; hint: string; color: string; small?: boolean }) {
  return (
    <Card style={{ ...styles.sumCard, ...(small ? styles.sumSmall : null) }}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, { color }]}>{value}</Text>
      <Text style={styles.muted}>{hint}</Text>
    </Card>
  );
}

function OrderCard({ order, busy, onPrint, onView, onOpen, onReverse }: { order: OrderRow; busy: boolean; onPrint: () => void; onView: () => void; onOpen: () => void; onReverse: () => void }) {
  const { t } = useTranslation();
  const { currency } = useBranch();
  const when = dateAndTime(orderWhen(order));
  const who = whoFor(order);
  const actions = orderActions(order);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.invoice}>#{order.invoiceNo}</Text>
        <Badge tone={order.orderStatus === 'COMPLETED' ? 'success' : 'outline'} text={t(`orders.status_${order.orderStatus}`, { defaultValue: order.orderStatus })} />
      </View>
      <View style={styles.row}>
        <Text style={styles.muted}>
          {when.date} {when.time}
        </Text>
        <Text style={styles.total}>{formatMoney(order.totalAmount, currency)}</Text>
      </View>
      <Text style={styles.muted}>{t('tables.items', { count: itemCount(order) })}</Text>
      <Text style={styles.body}>
        {who.kind === 'customer' ? '👤 ' : ''}
        {who.name}
        {who.phone ? ` · ${who.phone}` : ''}
        {who.email ? ` · ${who.email}` : ''}
      </Text>
      <View style={styles.row}>
        {actions.includes('print') ? <Button title={t('orders.printReceipt', { count: order.printCount || 0 })} variant="outline" size="sm" disabled={busy} onPress={onPrint} /> : null}
        {actions.includes('view') ? <Button title={t('orders.viewDetails')} variant="outline" size="sm" onPress={onView} /> : null}
        {actions.includes('open') ? <Button title={t('orders.openInRestaurant')} variant="outline" size="sm" onPress={onOpen} /> : null}
        {actions.includes('reverse') ? <Button title={t('orders.undo')} variant="ghost" size="sm" disabled={busy} onPress={onReverse} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6 },
  list: { padding: space.md, gap: space.sm, paddingBottom: TAB_BAR_SPACE + 48 },
  summary: { gap: space.sm, marginBottom: space.xs },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sumCard: { flexGrow: 1, flexBasis: '45%', padding: space.md, gap: 2, borderRadius: radius.lg },
  sumSmall: { flexBasis: '30%' },
  sumLabel: { fontSize: font.small, color: colors.mutedForeground },
  sumValue: { fontSize: font.title, fontWeight: '700' },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  invoice: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  total: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  more: { marginVertical: space.lg },
});

import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DateRange } from '@/lib/dates';
import { rangeFor } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { invoiceDigits, ORDER_STATUSES, statusTone, summarize, type OrderFilter, type OrderRow, type OrderStatus } from '@/lib/orders';
import { useSession } from '@/lib/session';
import { clock, parseKhPosTime } from '@/lib/time';
import { useBranch } from '@/lib/use-branch';
import { Badge, Card, Chip, Input } from '@/ui/components';
import { DateRangeBar } from '@/ui/date-range-bar';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;

/**
 * The branch's orders like the kh-pos Order page: filter by day(s), status and invoice number,
 * with the totals of what is shown. Tap an order for its details, receipt, returns and reversing
 * it to a draft. Works from the last loaded copy when the server can't be reached.
 */
export default function OrdersScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();

  const [range, setRange] = useState<DateRange | null>(() => rangeFor('today'));
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const request = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(h);
  }, [search]);

  const filter = useCallback(
    (offset: number): OrderFilter => ({
      limit: PAGE,
      offset,
      ...(status ? { status } : {}),
      ...(invoiceDigits(query) ? { invoiceNo: invoiceDigits(query) } : {}),
      ...(range ? { startDate: range.start, endDate: range.end } : {}),
    }),
    [status, query, range],
  );

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const f = filter(offset);
      try {
        const r = await data.cachedRead('orders', JSON.stringify(f), () => api.orders(f));
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

  // A new filter, or kh-pos came back: read the first page again.
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

  const sum = summarize(orders);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('orders.title')} />
      <DateRangeBar initial="today" onChange={(r) => setRange(r)} />
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('orders.searchInvoice')} keyboardType="numbers-and-punctuation" autoCorrect={false} accessibilityLabel={t('orders.searchInvoice')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.all')} selected={status === ''} onPress={() => setStatus('')} />
          {ORDER_STATUSES.map((s) => (
            <Chip key={s} label={t(`orders.status_${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ScrollView>
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
              <Card style={styles.sumCard}>
                <Text style={styles.sumLabel}>{t('orders.completed')}</Text>
                <Text style={styles.sumValue}>{formatMoney(sum.completedTotal, currency)}</Text>
                <Text style={styles.muted}>{t('orders.count', { count: sum.completedCount })}</Text>
              </Card>
              <Card style={styles.sumCard}>
                <Text style={styles.sumLabel}>{t('orders.draft')}</Text>
                <Text style={styles.sumValue}>{formatMoney(sum.draftTotal, currency)}</Text>
                <Text style={styles.muted}>{t('orders.count', { count: sum.draftCount })}</Text>
              </Card>
            </View>
          }
          renderItem={({ item }) => <OrderCard order={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          onEndReached={() => void more()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState title={t('orders.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const { currency } = useBranch();
  const at = parseKhPosTime(order.paidAt ?? order.createdAt);
  const portions = (order.items ?? []).reduce((a, i) => a + (Number(i.qty) || 0), 0);
  return (
    <Pressable onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.orderId } })} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.invoice}>#{order.invoiceNo}</Text>
          <Badge tone={statusTone(order.orderStatus)} text={t(`orders.status_${order.orderStatus}`, { defaultValue: order.orderStatus })} />
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>
            {[order.createdBy?.fullname || order.createdBy?.username, at ? clock(at) : null].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.total}>{formatMoney(order.totalAmount, currency)}</Text>
        </View>
        {portions > 0 ? <Text style={styles.muted}>{t('tables.items', { count: portions })}</Text> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6 },
  list: { padding: space.md, gap: space.sm },
  summary: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  sumCard: { flex: 1, padding: space.md, gap: 2, borderRadius: radius.lg },
  sumLabel: { fontSize: font.small, color: colors.mutedForeground },
  sumValue: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  invoice: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  total: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  pressed: { opacity: 0.7 },
  more: { marginVertical: space.lg },
});

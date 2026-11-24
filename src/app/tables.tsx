import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QrCode, Store, Users } from 'lucide-react-native';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { applyOutbox } from '@/lib/offline/overlay';
import { useOffline } from '@/lib/offline/provider';
import { orderCounts } from '@/lib/order';
import { useSession } from '@/lib/session';
import { invoiceLink, tableMenuLink } from '@/lib/qr';
import { groupSeat, openGroups, seatId, splitSeat, waitingSeats } from '@/lib/table-groups';
import { useBranch } from '@/lib/use-branch';
import { QrSheet } from '@/ui/qr-sheet';
import { TableGroupsSheet } from '@/ui/table-groups-sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner, SyncBadge } from '@/ui/sync-status';
import { HeaderBar } from '@/ui/screen-header';
import { TabBar, TAB_BAR_SPACE } from '@/ui/tab-bar';
import { colors, font, radius, shadow, space } from '@/ui/theme';

const REFRESH_MS = 15_000;

/** Staff home: the branch's tables with their status and open order. */
export default function TablesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'all' | 'free' | 'busy'>('all');
  const { data, state } = useOffline();
  const { currency, tableMode } = useBranch();
  const tagMode = tableMode === 'TAG';
  /** "Table + Tag" style: the table whose groups are listed. */
  const [groupsOf, setGroupsOf] = useState<string | null>(null);
  const [saved, setSaved] = useState<RestaurantTable[] | null>(null);
  /** When the list on screen was saved, if kh-pos couldn't be reached. */
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** The QR code on screen: a table's menu link or an open order's invoice link. */
  const [qr, setQr] = useState<{ title: string; subtitle?: string; link: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await data.tables();
      setSaved(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data]);

  // Changes waiting to be sent are shown on their tables (an offline order looks like any other).
  const tables = useMemo(() => (saved ? saved.map((t) => applyOutbox(t, state.commands)) : null), [saved, state.commands]);

  /**
   * "Table + Tag" style: each table's groups as seats (lib/table-groups.ts), the open ones from kh-pos plus
   * groups started on this phone that kh-pos hasn't received yet, with their waiting changes applied.
   */
  const groups = useMemo(() => {
    const m = new Map<string, RestaurantTable[]>();
    if (!tagMode || !saved) return m;
    const waiting = state.commands.filter((c) => c.status === 'pending').map((c) => c.tableId);
    for (const t of saved) {
      const ids = new Set([...openGroups(t).map((o) => o.orderId), ...waitingSeats(t.id, waiting).map((id) => splitSeat(id).orderId!)]);
      const seats = [...ids].map((orderId) => applyOutbox(groupSeat(t, orderId), state.commands)).filter((g) => g.order);
      seats.sort((a, b) => String(a.order?.tagNo ?? '~').localeCompare(String(b.order?.tagNo ?? '~')));
      m.set(t.id, seats);
    }
    return m;
  }, [tagMode, saved, state.commands]);

  function openTable(table: RestaurantTable) {
    if (!tagMode) {
      router.push({ pathname: '/table/[id]', params: { id: table.id } });
      return;
    }
    if ((groups.get(table.id) ?? []).length === 0) newGroup(table.id);
    else setGroupsOf(table.id);
  }

  /** A new group gets its own order id now; kh-pos opens that order (with the next free tag) on its first dish. */
  function newGroup(tableId: string) {
    setGroupsOf(null);
    router.push({ pathname: '/table/[id]', params: { id: seatId(tableId, Crypto.randomUUID()) } });
  }


  // Reload whenever the screen is shown, and keep it fresh while it stays open
  // (other staff and the web POS change tables too).
  // It also reloads after changes were sent to kh-pos and when kh-pos is back.
  const { syncVersion, online } = state;
  useFocusEffect(
    useCallback(() => {
      void load();
      const h = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(h);
    // syncVersion and online are triggers: reload when changes were sent or kh-pos came back
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, syncVersion, online]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  /** Like the web table menu: "Qr Code" for the table, and "Gen Invoice QR" when it has an open order. */
  function showQr(table: RestaurantTable) {
    // customers open these links in their own browser: there is no web page without a kh-pos server
    if (api.onPhone) {
      Alert.alert(t('phone.noWebPages'));
      return;
    }
    const branch = user?.currentWarehouseId;
    const tableQr = () => setQr({ title: t('qr.tableTitle'), subtitle: table.table_name, link: tableMenuLink(api.baseUrl, branch, table.id) });
    // with tags, a table holds several bills: only the table's menu QR here
    const orderId = !tagMode && table.order && !table.order.localOnly ? table.order.orderId : null;
    if (!orderId) {
      tableQr();
      return;
    }
    Alert.alert(table.table_name, undefined, [
      { text: t('qr.tableTitle'), onPress: tableQr },
      {
        text: t('qr.invoiceTitle'),
        onPress: () => setQr({ title: `${t('qr.invoiceTitle')}${table.order?.invoiceNo ? ` (#${table.order.invoiceNo})` : ''}`, subtitle: t('qr.tableName', { name: table.table_name }), link: invoiceLink(api.baseUrl, branch, orderId) }),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  /** In use: has an open order (or a group), or kh-pos marks it taken. */
  const inUse = (tb: RestaurantTable) => (tagMode ? (groups.get(tb.id) ?? []).length > 0 : !!tb.order || tb.status === 'order_taken');
  const busyCount = tables ? tables.filter(inUse).length : 0;
  const freeCount = tables ? tables.length - busyCount : 0;
  const shown = tables ? tables.filter((tb) => (filter === 'all' ? true : filter === 'busy' ? inUse(tb) : !inUse(tb))) : null;
  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: t('tables.filterAll'), count: tables?.length ?? 0 },
    { id: 'free', label: t('tableStatus.available'), count: freeCount },
    { id: 'busy', label: t('tables.inUse'), count: busyCount },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HeaderBar>
        <View style={styles.topRow}>
          <View style={styles.storeIcon}>
            <Store size={18} color="#fff" strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.branch} numberOfLines={1}>
              {user?.warehouse?.name ?? t('common.appName')}
            </Text>
            <Text style={styles.staff} numberOfLines={1}>
              {[user?.fullname || user?.username, user?.role?.role].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <SyncBadge />
        </View>
        <Text style={styles.title}>{t('tables.title')}</Text>
        <Text style={styles.summary}>{t('tables.summary', { busy: busyCount, free: freeCount })}</Text>
        <View style={styles.filters}>
          {filters.map((f) => {
            const active = f.id === filter;
            return (
              <Pressable key={f.id} onPress={() => setFilter(f.id)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label} · {f.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </HeaderBar>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {shown === null ? (
        error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : (
          <LoadingState />
        )
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(x) => x.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[shown.length ? styles.grid : styles.gridEmpty, { paddingBottom: TAB_BAR_SPACE + insets.bottom + space.lg }]}
          renderItem={({ item }) => (
            <TableCard
              table={item}
              groups={tagMode ? (groups.get(item.id) ?? []) : undefined}
              currency={currency}
              onPress={() => openTable(item)}
              onQr={() => showQr(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListEmptyComponent={<EmptyState title={t('tables.empty')} />}
        />
      )}
      {groupsOf && tables?.find((x) => x.id === groupsOf) ? (
        <TableGroupsSheet
          table={tables.find((x) => x.id === groupsOf)!}
          groups={groups.get(groupsOf) ?? []}
          currency={currency}
          onOpen={(id) => {
            setGroupsOf(null);
            router.push({ pathname: '/table/[id]', params: { id } });
          }}
          onNewGroup={() => newGroup(groupsOf)}
          onClose={() => setGroupsOf(null)}
        />
      ) : null}
      {qr ? <QrSheet title={qr.title} subtitle={qr.subtitle} link={qr.link} onClose={() => setQr(null)} /> : null}
      <TabBar current="tables" />
    </SafeAreaView>
  );
}

const STATUS_TONE = {
  available: { bg: colors.successBg, fg: colors.success },
  order_taken: { bg: colors.brandSoft, fg: colors.brandFrom },
  cleaning: { bg: colors.warningBg, fg: colors.warning },
} as const;

function StatusPill({ text, tone }: { text: string; tone: { bg: string; fg: string } }) {
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.pillText, { color: tone.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function TableCard({
  table,
  groups,
  currency,
  onPress,
  onQr,
}: {
  table: RestaurantTable;
  /** "Table + Tag" style: the groups at this table (see TablesScreen). */
  groups?: RestaurantTable[];
  currency: CurrencyCode;
  onPress: () => void;
  onQr: () => void;
}) {
  const { t } = useTranslation();
  const orders = groups ? groups.map((g) => g.order).filter((o): o is NonNullable<typeof o> => !!o) : table.order ? [table.order] : [];
  const busy = orders.length > 0 || (!groups && table.status === 'order_taken');
  const status = groups ? (busy ? 'order_taken' : table.status === 'cleaning' ? 'cleaning' : 'available') : table.status;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.available;
  const counts = orders.map((o) => orderCounts(o));
  const portions = counts.reduce((a, c) => a + c.portions, 0);
  const pending = counts.reduce((a, c) => a + c.pending, 0);
  const total = orders.reduce((a, o) => a + Number(o.totalAmount || 0), 0);
  const waiting = groups ? groups.some((g) => g.pendingSync) : !!table.pendingSync;
  const statusText = groups && orders.length > 1 ? t('tables.groups', { count: orders.length }) : t(`tableStatus.${status}`);
  const ref = groups
    ? orders.map((o) => o.tagNo ?? '…').join(' · ')
    : table.order
      ? table.order.localOnly
        ? t('offline.notOpened')
        : `#${table.order.invoiceNo}`
      : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${table.table_name}, ${statusText}`}
      style={({ pressed }) => [styles.card, busy && styles.cardBusy, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.tableName} numberOfLines={1}>
          {table.table_name}
        </Text>
        <StatusPill text={statusText} tone={tone} />
      </View>

      {busy ? (
        <View style={styles.orderInfo}>
          <Text style={styles.amount}>{formatMoney(total, currency)}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[ref, t('tables.items', { count: portions })].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.badges}>
            {pending > 0 ? <Text style={[styles.badge, styles.badgeWarn]}>{t('tables.toSend', { count: pending })}</Text> : null}
            {waiting ? <Text style={[styles.badge, styles.badgeInfo]}>{t('offline.notSent')}</Text> : null}
          </View>
        </View>
      ) : (
        <View style={styles.seats}>
          <Users size={16} color={colors.mutedForeground} />
          <Text style={styles.meta}>{table.setting_capacity ? t('tables.seats', { count: table.setting_capacity }) : '—'}</Text>
        </View>
      )}

      <View style={styles.cardBottom}>
        <Text style={styles.section} numberOfLines={1}>
          {table.section ?? ''}
        </Text>
        <Pressable onPress={onQr} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qr.button', { name: table.table_name })} style={({ pressed }) => [styles.qrButton, pressed && styles.pressed]}>
          <QrCode size={16} color={colors.brandFrom} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  storeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  branch: { fontSize: font.body, fontWeight: '800', color: '#fff' },
  staff: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: space.md },
  summary: { fontSize: font.small, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  filter: { paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.18)' },
  filterActive: { backgroundColor: '#fff' },
  filterText: { fontSize: font.small, fontWeight: '600', color: '#fff' },
  filterTextActive: { color: colors.brandFrom, fontWeight: '800' },

  grid: { padding: space.md, gap: space.md },
  gridEmpty: { flexGrow: 1, padding: space.md },
  row: { gap: space.md },
  card: {
    flex: 1,
    minHeight: 150,
    padding: space.md,
    gap: space.sm,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardBusy: { borderColor: '#c7d7ff', borderLeftWidth: 4, borderLeftColor: colors.brandFrom, backgroundColor: '#fbfcff' },
  pressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  tableName: { flexShrink: 1, fontSize: font.title, fontWeight: '800', color: colors.foreground },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  orderInfo: { gap: 3 },
  amount: { fontSize: font.heading, fontWeight: '800', color: colors.foreground },
  meta: { fontSize: 12, color: colors.mutedForeground },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  badgeWarn: { color: colors.warning, backgroundColor: colors.warningBg },
  badgeInfo: { color: colors.info, backgroundColor: colors.infoBg },
  seats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', gap: space.sm },
  section: { flexShrink: 1, fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  qrButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
});

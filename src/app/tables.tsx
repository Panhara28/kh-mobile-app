import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { applyOutbox } from '@/lib/offline/overlay';
import { useOffline } from '@/lib/offline/provider';
import { orderCounts } from '@/lib/order';
import { useSession } from '@/lib/session';
import { invoiceLink, tableMenuLink } from '@/lib/qr';
import { groupSeat, openGroups, seatId, splitSeat, waitingSeats } from '@/lib/table-groups';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button } from '@/ui/components';
import { QrSheet } from '@/ui/qr-sheet';
import { TableGroupsSheet } from '@/ui/table-groups-sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner, SyncBadge } from '@/ui/sync-status';
import { colors, font, radius, shadow, space } from '@/ui/theme';

const REFRESH_MS = 15_000;

/** Staff home: the branch's tables with their status and open order. */
export default function TablesScreen() {
  const { t } = useTranslation();
  const { api, user, logout } = useSession();
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

  function confirmLogout() {
    // Logging in is checked by the KH POS server, so after logging out offline the staff member can't
    // get back in until the server is reachable. Say so before it happens; changes waiting to be
    // sent stay on the phone and go out after the next login.
    const warning = [!state.online ? t('offline.logoutOffline') : null, state.pending > 0 ? t('offline.logoutPending', { count: state.pending }) : null]
      .filter(Boolean)
      .join('\n\n');
    Alert.alert(t('session.logoutConfirm'), warning || undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.branch} numberOfLines={1}>
            {user?.warehouse?.name ?? t('common.appName')}
          </Text>
          <Text style={styles.staff} numberOfLines={1}>
            {[user?.fullname || user?.username, user?.role?.role].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <SyncBadge />
        <Button title={`☰ ${t('more.title')}`} variant="outline" size="sm" onPress={() => router.push('/more')} />
        <Button title={t('common.logout')} variant="outline" size="sm" onPress={confirmLogout} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {tables === null ? (
        error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : (
          <LoadingState />
        )
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(x) => x.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={tables.length ? styles.grid : styles.gridEmpty}
          ListHeaderComponent={<Text style={styles.title}>{t('tables.title')}</Text>}
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
    </SafeAreaView>
  );
}

const statusTone = { available: 'outline', order_taken: 'default', cleaning: 'info' } as const;

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
  const counts = orderCounts(table.order);
  const occupied = groups ? groups.length > 0 : table.status === 'order_taken';
  if (groups && groups.length > 0) {
    const total = groups.reduce((a, g) => a + Number(g.order?.totalAmount ?? 0), 0);
    const all = groups.map((g) => orderCounts(g.order));
    const portions = all.reduce((a, c) => a + c.portions, 0);
    const pending = all.reduce((a, c) => a + c.pending, 0);
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${table.table_name}, ${t('tables.groups', { count: groups.length })}`}
        style={({ pressed }) => [styles.card, styles.cardOccupied, pressed && styles.pressed]}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.tableName, styles.textOnDark]} numberOfLines={1}>
            {table.table_name}
          </Text>
          <Badge text={t('tables.groups', { count: groups.length })} tone="outline" />
        </View>
        <View style={styles.orderInfo}>
          <Text style={[styles.amount, styles.textOnDark]}>{formatMoney(total, currency)}</Text>
          <Text style={[styles.meta, styles.metaOnDark]} numberOfLines={1}>
            {groups.map((g) => g.order?.tagNo ?? '…').join(' · ')} · {t('tables.items', { count: portions })}
          </Text>
          {pending > 0 ? <Badge tone="warning" text={t('tables.toSend', { count: pending })} /> : null}
          {groups.some((g) => g.pendingSync) ? <Badge tone="info" text={t('offline.notSent')} /> : null}
        </View>
        <Pressable onPress={onQr} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qr.button', { name: table.table_name })} style={[styles.qrButton, styles.qrButtonOnDark]}>
          <Text style={[styles.qrText, styles.textOnDark]}>▦ {t('qr.short')}</Text>
        </Pressable>
      </Pressable>
    );
  }
  if (groups) table = { ...table, order: null, status: table.status === 'order_taken' ? 'available' : table.status };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${table.table_name}, ${t(`tableStatus.${table.status}`)}`}
      style={({ pressed }) => [styles.card, occupied && styles.cardOccupied, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.tableName, occupied && styles.textOnDark]} numberOfLines={1}>
          {table.table_name}
        </Text>
        <Badge text={t(`tableStatus.${table.status}`)} tone={occupied ? 'outline' : statusTone[table.status] ?? 'outline'} />
      </View>
      {table.order ? (
        <View style={styles.orderInfo}>
          <Text style={[styles.amount, occupied && styles.textOnDark]}>{formatMoney(table.order.totalAmount, currency)}</Text>
          <Text style={[styles.meta, occupied && styles.metaOnDark]}>
            {table.order.localOnly ? t('offline.notOpened') : `#${table.order.invoiceNo}`} · {t('tables.items', { count: counts.portions })}
          </Text>
          {counts.pending > 0 ? <Badge tone="warning" text={t('tables.toSend', { count: counts.pending })} /> : null}
          {table.pendingSync ? <Badge tone="info" text={t('offline.notSent')} /> : null}
        </View>
      ) : (
        <Text style={[styles.meta, occupied && styles.metaOnDark]}>
          {table.setting_capacity ? t('tables.seats', { count: table.setting_capacity }) : ' '}
        </Text>
      )}
      <Pressable onPress={onQr} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('qr.button', { name: table.table_name })} style={[styles.qrButton, occupied && styles.qrButtonOnDark]}>
        <Text style={[styles.qrText, occupied && styles.textOnDark]}>▦ {t('qr.short')}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  branch: { fontSize: font.title, fontWeight: '600', color: colors.foreground },
  staff: { fontSize: font.small, color: colors.mutedForeground, marginTop: 2 },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, marginBottom: space.sm },
  grid: { padding: space.md, gap: space.md },
  gridEmpty: { flexGrow: 1, padding: space.md },
  row: { gap: space.md },
  card: {
    flex: 1,
    minHeight: 120,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardOccupied: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  tableName: { flexShrink: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
  textOnDark: { color: colors.primaryForeground },
  orderInfo: { gap: 4 },
  qrButton: { alignSelf: 'flex-start', marginTop: 'auto', paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  qrButtonOnDark: { borderColor: '#a1a1aa' },
  qrText: { fontSize: 12, fontWeight: '600', color: colors.foreground },
  amount: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 12, color: colors.mutedForeground },
  metaOnDark: { color: '#a1a1aa' },
});

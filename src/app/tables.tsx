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
import { useBranch } from '@/lib/use-branch';
import { Badge, Button } from '@/ui/components';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner, SyncBadge } from '@/ui/sync-status';
import { colors, font, radius, shadow, space } from '@/ui/theme';

const REFRESH_MS = 15_000;

/** Staff home: the branch's tables with their status and open order. */
export default function TablesScreen() {
  const { t } = useTranslation();
  const { user, logout } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();
  const [saved, setSaved] = useState<RestaurantTable[] | null>(null);
  /** When the list on screen was saved, if kh-pos couldn't be reached. */
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

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
              currency={currency}
              onPress={() => router.push({ pathname: '/table/[id]', params: { id: item.id } })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListEmptyComponent={<EmptyState title={t('tables.empty')} />}
        />
      )}
    </SafeAreaView>
  );
}

const statusTone = { available: 'outline', order_taken: 'default', cleaning: 'info' } as const;

function TableCard({ table, currency, onPress }: { table: RestaurantTable; currency: CurrencyCode; onPress: () => void }) {
  const { t } = useTranslation();
  const counts = orderCounts(table.order);
  const occupied = table.status === 'order_taken';
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
  amount: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 12, color: colors.mutedForeground },
  metaOnDark: { color: '#a1a1aa' },
});

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { MOVEMENT_TYPES, movementDirection, movementQuery, variantLabel, type MovementRow } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { Badge, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** Stock movements (sales, purchases, stock in and out, adjustments, transfers) like the kh-pos web Transaction page: the latest 300. */
export default function StockMovementsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const [type, setType] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const fetcher = useCallback(
    () =>
      fetchAllPages<MovementRow>(async (offset, limit) => (await api.call<{ result: { data: MovementRow[]; total: number } }>('GET', `/api/inventory-transactions?${movementQuery(type ? [type] : [], limit, offset)}`)).result, 100, 3),
    [api, type],
  );
  const load = useCachedLoad<MovementRow[]>('movements', type || 'ALL', fetcher);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.stockMovements')} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.all')} selected={type === ''} onPress={() => setType('')} />
          {MOVEMENT_TYPES.map((m) => (
            <Chip key={m} label={t(`stock.type_${m}`)} selected={type === m} onPress={() => setType(m)} />
          ))}
        </ScrollView>
      </View>
      {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}
      {load.value === null ? (
        load.loading ? <LoadingState /> : <ErrorState error={load.error} onRetry={() => void load.reload()} />
      ) : (
        <FlatList
          data={load.value}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load.reload(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('stock.empty')} />}
          renderItem={({ item }) => {
            const out = movementDirection(item.transactionType, item.qty) === 'out';
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading} numberOfLines={2}>
                    {variantLabel(item.variant) || '-'}
                  </Text>
                  <Text style={[styles.qty, { color: out ? colors.destructive : colors.success }]}>
                    {out ? '−' : '+'}
                    {Math.abs(item.qty)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Badge tone="outline" text={t(`stock.type_${item.transactionType}`, { defaultValue: item.transactionType ?? '' })} />
                  <Text style={styles.muted}>{[item.slot?.name, item.createdBy?.fullname || item.createdBy?.username].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={styles.muted}>{item.createdAt}</Text>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { flex: 1, fontSize: font.body, fontWeight: '700', color: colors.foreground },
  qty: { fontSize: font.title, fontWeight: '700' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
});

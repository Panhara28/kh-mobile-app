import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { MOVEMENT_PAGE, MOVEMENT_TYPES, movementAmount, movementDate, movementImage, movementQty, movementQuery, movementSlot, rowTypeKey, type MovementRow } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Transactions like the kh-pos web page (Inventory > Transactions): every stock movement of the branch,
 * newest first, paged, with the same filter list. Each row: product, transaction, slot and branch, date,
 * quantity and amount (cost per unit × quantity).
 */
export default function StockMovementsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();
  const [type, setType] = useState('');
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const run = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = movementQuery(type ? [type] : [], MOVEMENT_PAGE, offset);
      try {
        const r = await data.cachedRead('movements-page', qs, async () => (await api.call<{ result?: { data: MovementRow[]; total: number } }>('GET', `/api/inventory-transactions?${qs}`)).result ?? { data: [], total: 0 });
        if (id !== run.current) return;
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      }
    },
    [data, api, type],
  );

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.stockMovements')} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('stock.all')} selected={type === ''} onPress={() => setType('')} />
          {MOVEMENT_TYPES.map((m) => (
            <Chip key={m} label={t(`stock.type_${m}`)} selected={type === m} onPress={() => setType(m)} />
          ))}
        </ScrollView>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m, i) => m.id ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || rows.length >= total) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('stock.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('stock.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item }) => {
            const img = movementImage(item);
            const amount = movementAmount(item);
            const key = rowTypeKey(item.transactionType);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="cover" /> : null}
                  <Text style={[styles.heading, styles.flex]} numberOfLines={2}>
                    {item.variant?.basicProduct?.title ?? '-'}
                  </Text>
                  <Text style={[styles.qty, { color: colors.info }]}>{movementQty(item)}</Text>
                </View>
                <View style={styles.row}>
                  <Badge tone="outline" text={key ? t(`stock.row_${key}`, { defaultValue: key.replace(/_/g, ' ') }) : '-'} />
                  <View style={styles.flex} />
                  <Text style={[styles.amount, { color: colors.success }]}>
                    {amount.negative ? '-' : ''}
                    {formatMoney(amount.value, currency)}
                  </Text>
                </View>
                <Text style={styles.body}>{movementSlot(item)}</Text>
                <Text style={styles.muted}>{[item.slot?.warehouse?.name, movementDate(item.createdAt)].filter(Boolean).join(' · ')}</Text>
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
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  img: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.muted },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  qty: { fontSize: font.title, fontWeight: '700' },
  amount: { fontSize: font.body, fontWeight: '700' },
  body: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  more: { marginVertical: space.lg },
});

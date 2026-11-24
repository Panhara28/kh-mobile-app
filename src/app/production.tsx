import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { historyQuery, rowAmount, rowImage, slotText, type ProductionRow } from '@/lib/production';
import { useSession } from '@/lib/session';
import { pickSetting } from '@/lib/settings';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card } from '@/ui/components';
import { ProduceForm } from '@/ui/production/produce-form';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Production like the kh-pos web page: the list of recent production (Compose In transactions) and a
 * "+" button (needs create permission) for the Add Products sheet. Making stock needs the server.
 */
export default function ProductionScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [rows, setRows] = useState<ProductionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [adding, setAdding] = useState(false);
  const [restrictLots, setRestrictLots] = useState(false);
  const run = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = historyQuery(offset);
      try {
        const r = await data.cachedRead('production-history', qs, async () => (await api.call<{ result?: { data: ProductionRow[]; total: number } }>('GET', `/api/inventory-transactions?${qs}`)).result ?? { data: [], total: 0 });
        if (id !== run.current) return;
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      }
    },
    [data, api],
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

  useEffect(() => {
    data.settings(warehouseId).then(
      ({ data: s }) => {
        try {
          setRestrictLots(!!JSON.parse(pickSetting(s, 'INVENTORY', warehouseId) ?? '{}').restrict_product_lot);
        } catch {
          setRestrictLots(false);
        }
      },
      () => undefined,
    );
  }, [data, warehouseId]);

  const mayAdd = can(user, 'production', 'create');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.production')} right={mayAdd ? <Button title={`+ ${t('production.add')}`} size="sm" onPress={() => setAdding(true)} /> : undefined} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => r.id ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || rows.length >= total) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.warn}>{t('production.recent', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('production.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item: r }) => {
            const img = rowImage(r);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="cover" /> : <View style={[styles.img, styles.noimg]} />}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>{r.variant?.basicProduct?.title ?? '-'}</Text>
                    <Text style={styles.muted}>{[slotText(r), r.slot?.warehouse?.name].filter(Boolean).join(' · ')}</Text>
                    <Text style={styles.muted}>{(r.createdAt ?? '').slice(0, 10)}</Text>
                  </View>
                  <View style={styles.right}>
                    <Badge tone="info" text={`${t('production.composeIn')}: ${r.qty}`} />
                    <Text style={styles.amount}>{formatMoney(rowAmount(r), currency)}</Text>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
      {adding ? (
        <ProduceForm
          api={api}
          warehouseId={warehouseId}
          currency={currency}
          restrictLots={restrictLots}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load(0);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  right: { alignItems: 'flex-end', gap: 4 },
  img: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  warn: { fontSize: font.body, fontWeight: '700', color: colors.warning },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  amount: { fontSize: font.small, fontWeight: '700', color: colors.success },
  more: { marginVertical: space.lg },
});

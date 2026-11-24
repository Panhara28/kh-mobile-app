import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { BACKLOG_PAGE, backlogCode, backlogImage, backlogQuery, backlogStock, variantLabel, type BacklogRow } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { Button, Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Back Log like the kh-pos web page: orders that could not be filled from stock, as the server lists
 * them. Each row shows the product, the slot and branch, the slot's current stock, the quantity wanted
 * and who created it; "Resolve" closes it once the stock is there. Resolving needs the server.
 */
export default function BacklogScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();

  const [rows, setRows] = useState<BacklogRow[]>([]);
  const listed = useRecordRows(rows, 'backlog', (b: BacklogRow) => b.id) ?? [];
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [busyId, setBusyId] = useState('');
  const run = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = backlogQuery(offset);
      try {
        const r = await data.cachedRead('backlog-page', qs, async () => (await api.call<{ result?: { data: BacklogRow[]; total: number } }>('GET', `/api/back-log-order?${qs}`)).result ?? { data: [], total: 0 });
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

  function resolve(r: BacklogRow) {
    // kept on the phone and sent later when kh-pos can't be reached; it takes the stock, so it is never sent twice.
    // The row leaves the list at once ("delete" only describes what the list shows; the request is the resolve call).
    void (async () => {
      setBusyId(r.id);
      try {
        const how = await writer({ entity: 'backlog', op: 'delete', recordId: r.id, method: 'POST', path: '/api/back-log-order/resolve', body: { backlogId: r.id }, label: t('backlog.resolve'), once: true });
        Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'backlog.resolved'));
        await load(0);
      } catch (e) {
        Alert.alert(t('backlog.resolveFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusyId('');
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.backlog')} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || rows.length >= total || rows.length < BACKLOG_PAGE) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('backlog.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('backlog.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item: r, index }) => {
            const img = backlogImage(r);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.code}>{backlogCode(index + 1)}</Text>
                  <Text style={styles.muted}>{r.createdAt}</Text>
                </View>
                <View style={styles.row}>
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>{variantLabel(r.variant) || '-'}</Text>
                    <Text style={styles.muted}>SKU: {r.variant?.sku}</Text>
                  </View>
                  <Text style={styles.qty}>{r.qty}</Text>
                </View>
                <Text style={styles.body}>
                  {t('backlog.slot')}: {r.slot?.name} {r.slot?.posSlot ? '(POS)' : ''}
                  {r.slot?.warehouse?.name ? ` · ${r.slot.warehouse.name}` : ''}
                </Text>
                <Text style={styles.body}>{t('backlog.currentStock')}: {backlogStock(r)}</Text>
                <Text style={styles.muted}>{t('backlog.by', { name: r.createdBy?.fullname ?? '' })}</Text>
                <Button title={t('backlog.resolve')} variant="outline" size="sm" disabled={busyId === r.id} loading={busyId === r.id} onPress={() => resolve(r)} />
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
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  img: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  code: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  heading: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  qty: { fontSize: font.title, fontWeight: '700', color: colors.info },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  more: { marginVertical: space.lg },
});

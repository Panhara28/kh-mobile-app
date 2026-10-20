import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { otherBranch, REP_PAGE, repActions, repCode, repFilters, repListQuery, repTone, type RepRow, type RepStatus } from '@/lib/replenishment';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Replenishment like the kh-pos web page. The main branch sees what it sends (and can add, edit and
 * delete drafts); another branch sees what is sent to it. Details open the replenishment.
 */
export default function ReplenishmentsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const isMain = !!user?.warehouse?.isMain;
  const warehouseId = user?.currentWarehouseId ?? '';
  const [status, setStatus] = useState<RepStatus | ''>('');
  const [rows, setRows] = useState<RepRow[]>([]);
  const listed = useRecordRows(rows, 'replenishment', (r: RepRow) => r.id) ?? [];
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const request = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const qs = repListQuery({ status: status || undefined, isMain, warehouseId, offset });
      try {
        const r = await data.cachedRead('replenishments', qs, async () => (await api.call<{ result?: { data: RepRow[] } }>('GET', `/api/replenishment?${qs}`)).result?.data ?? []);
        if (id !== request.current) return;
        setRows((prev) => (offset === 0 ? r.data : [...prev, ...r.data.filter((p) => !prev.some((q) => q.id === p.id))]));
        setDone(r.data.length < REP_PAGE);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, status, isMain, warehouseId],
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

  function remove(r: RepRow) {
    Alert.alert(t('rep.deleteTitle'), t('rep.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const how = await writer({ entity: 'replenishment', op: 'delete', recordId: r.id, method: 'DELETE', path: '/api/replenishment', body: { id: r.id }, label: `${t('rep.deleteTitle')}: ${r.id.slice(0, 8)}` });
              Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'rep.deleted'));
              await load(0);
            } catch (e) {
              Alert.alert(t('rep.deleteFailed'), e instanceof Error ? e.message : undefined);
            }
          })(),
      },
    ]);
  }

  const mayAdd = isMain && can(user, 'replenishment', 'create');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.replenishment')} right={isMain ? <View style={styles.headRight}><Button title={t('rep.suggestions')} variant="outline" size="sm" onPress={() => router.push('/replenishment/suggest')} />{mayAdd ? <Button title={`+ ${t('rep.addNew')}`} size="sm" onPress={() => router.push({ pathname: '/replenishment/[id]', params: { id: 'new' } })} /> : null}</View> : undefined} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.all')} selected={status === ''} onPress={() => setStatus('')} />
          {repFilters(isMain).map((s) => (
            <Chip key={s} label={t(`rep.status_${s}`)} selected={status === s} onPress={() => setStatus(s)} />
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
          data={listed}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (more || done) return;
            setMore(true);
            await load(rows.length);
            setMore(false);
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState title={t('rep.empty')} />}
          ListFooterComponent={more ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          renderItem={({ item }) => {
            const actions = repActions(item.status, isMain);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{repCode(item.autoId)}</Text>
                  <Badge tone={repTone(item.status)} text={t(`rep.status_${item.status}`, { defaultValue: item.status })} />
                </View>
                <Text style={styles.body}>
                  {isMain ? t('rep.toWarehouse') : t('rep.fromWarehouse')}: {otherBranch(item, isMain)}
                </Text>
                <Text style={styles.muted}>{t('rep.createdAt')}: {item.createdAt?.slice(0, 10)}</Text>
                <Text style={styles.body}>
                  {t('rep.totalSent')}: {item.totalSentQty ?? 0} · {t('rep.totalReceived')}: {item.totalReceivedQty ?? 0}
                </Text>
                <Text style={styles.total}>{t('rep.totalCost')}: {formatMoney(item.totalCost ?? 0, 'USD')}</Text>
                <View style={styles.row}>
                  {actions.includes('details') ? <Button title={t('rep.details')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/replenishment/[id]', params: { id: item.id } })} /> : null}
                  {actions.includes('edit') && can(user, 'replenishment', 'update') ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/replenishment/[id]', params: { id: item.id, edit: '1' } })} /> : null}
                  {actions.includes('delete') && can(user, 'replenishment', 'delete') ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(item)} /> : null}
                </View>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  total: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  more: { marginVertical: space.lg },
  headRight: { flexDirection: 'row', gap: space.sm },
});

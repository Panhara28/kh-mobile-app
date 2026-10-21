import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { isUnsent } from '@/lib/offline/records';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { PO_STATUSES, poQuery, receivedText, rowActions, statusTone, type PoRow, type PoStatus } from '@/lib/purchase';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;

/** Purchase orders like the kh-pos web page: filter by status, open one, or make a new one. */
export default function PurchaseOrdersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [status, setStatus] = useState<PoStatus | ''>('');
  const [rows, setRows] = useState<PoRow[]>([]);
  const listed = useRecordRows(rows, 'purchase-order', (p: PoRow) => p.id) ?? [];
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
      const qs = poQuery({ status: status || undefined, warehouseId, limit: PAGE, offset });
      try {
        const r = await data.cachedRead('pos', qs, async () => (await api.call<{ result?: PoRow[] }>('GET', `/api/purchase-order?${qs}`)).result ?? []);
        if (id !== request.current) return;
        setRows((prev) => (offset === 0 ? r.data : [...prev, ...r.data.filter((p) => !prev.some((q) => q.id === p.id))]));
        setDone(r.data.length < PAGE);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, status, warehouseId],
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

  function remove(p: PoRow) {
    Alert.alert(t('po.deleteTitle'), t('po.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const how = await writer({ entity: 'purchase-order', op: 'delete', recordId: p.id, method: 'DELETE', path: '/api/purchase-order', body: { id: p.id }, label: `${t('po.deleteTitle')}: ${p.poIncrement ?? p.id.slice(0, 8)}` });
              Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'po.deleted'));
              await load(0);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          })(),
      },
    ]);
  }

  const open = (p: PoRow, extra: Record<string, string> = {}) => router.push({ pathname: '/purchase-order/[id]', params: { id: p.id, ...extra } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.purchaseOrders')} right={can(user, 'purchase-order', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => router.push({ pathname: '/purchase-order/[id]', params: { id: 'new' } })} /> : undefined} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('orders.all')} selected={status === ''} onPress={() => setStatus('')} />
          {PO_STATUSES.map((s) => (
            <Chip key={s} label={t(`po.status_${s}`)} selected={status === s} onPress={() => setStatus(s)} />
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
          ListEmptyComponent={<EmptyState title={t('po.empty')} />}
          ListFooterComponent={more ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          renderItem={({ item }) => {
            const actions = isUnsent(item, state.commands, 'purchase-order', item.id) ? [] : rowActions(item.status);
            const unsent = isUnsent(item, state.commands, 'purchase-order', item.id);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>#{item.poIncrement ?? item.id.slice(0, 6)}</Text>
                  <Badge tone={statusTone(item.status)} text={t(`po.status_${item.status}`, { defaultValue: item.status })} />
                </View>
                <Text style={styles.body}>{item.supplier?.name}</Text>
                <Text style={styles.muted}>{[item.purchasedAt?.slice(0, 10), item.warehouse?.name].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.body}>{t('po.receivedCol')}: {receivedText(item)}</Text>
                <Text style={styles.muted}>{t('po.expectedOn')}: {item.expectedAt ? item.expectedAt.slice(0, 10) : 'N/A'}</Text>
                <Text style={styles.total}>{formatMoney(item.receivedTotal ?? 0, 'USD')} / {formatMoney(item.total ?? 0, 'USD')}</Text>
                <View style={styles.row}>
                  {unsent ? <Badge tone="info" text={t('offline.notSent')} /> : <Button title={item.status === 'draft' ? t('po.approve') : t('po.viewDetails')} variant="outline" size="sm" onPress={() => open(item)} />}
                  {actions.includes('receive') && can(user, 'purchase-order', 'update') ? <Button title={t('po.createReceive')} variant="outline" size="sm" onPress={() => open(item, { receive: '1' })} /> : null}
                  {actions.includes('edit') && can(user, 'purchase-order', 'update') ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => open(item, { edit: '1' })} /> : null}
                  {actions.includes('delete') && can(user, 'purchase-order', 'delete') ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(item)} /> : null}
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
  body: { fontSize: font.small, color: colors.foreground },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  total: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  more: { marginVertical: space.lg },
});

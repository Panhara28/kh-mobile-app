import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { hasPending } from '@/lib/offline/records';
import { useRecordWriter } from '@/lib/offline/use-record';
import { RETURN_PAGE, returnCode, returnHistory, returnImage, returnProduct, returnsQuery, type ReturnRow, type ReturnTab, type StockInSlot } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Order Return like the kh-pos web page: items customers returned, in two tabs (Returned, Stock In).
 * Each row can open its order or show its "Stock info" (the slot the item goes back to) and be
 * put back in stock. Putting back needs the server.
 */
export default function ReturnsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();

  const [tab, setTab] = useState<ReturnTab>('returned');
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [info, setInfo] = useState<ReturnRow | null>(null);
  const run = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = returnsQuery(tab, offset);
      try {
        const r = await data.cachedRead('returns-page', qs, async () => {
          const res = (await api.call<{ result?: { totalRows: number | { total: number }[]; data: ReturnRow[] } }>('GET', `/api/pos/return?${qs}`)).result;
          const totalRows = Array.isArray(res?.totalRows) ? Number(res.totalRows[0]?.total ?? 0) : Number(res?.totalRows ?? 0);
          return { data: res?.data ?? [], total: totalRows };
        });
        if (id !== run.current) return;
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(r.data.total);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      }
    },
    [data, api, tab],
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
      <ScreenHeader title={t('more.returns')} />
      <View style={styles.filters}>
        <View style={styles.row}>
          <Chip label={t('returns.tab_returned')} selected={tab === 'returned'} onPress={() => setTab('returned')} />
          <Chip label={t('returns.tab_stock_in')} selected={tab === 'stock_in'} onPress={() => setTab('stock_in')} />
        </View>
      </View>
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
            if (moreLoading || rows.length >= total || rows.length < RETURN_PAGE) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('returns.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('returns.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item: r, index }) => {
            const img = returnImage(r);
            const history = returnHistory(r);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.code}>{returnCode(index + 1)}</Text>
                  <Text style={styles.muted}>{t('returns.invoice')}: {r.orderInvoiceNumber}</Text>
                  <View style={styles.flex} />
                  <Badge tone={r.status === 'stock_in' ? 'success' : 'warning'} text={r.status === 'stock_in' ? t('returns.tab_stock_in') : t('returns.tab_returned')} />
                </View>
                <View style={styles.row}>
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                  <Text style={[styles.heading, styles.flex]} numberOfLines={2}>{returnProduct(r)}</Text>
                </View>
                <Text style={styles.body}>
                  {t('returns.quantity')}: {r.quantity} · {t('returns.refund')}: {formatMoney(r.refundAmount, currency)}
                </Text>
                {r.reason ? <Text style={styles.reason}>{`"${r.reason}"`}</Text> : null}
                {history.map((h) => (
                  <Text key={h.kind} style={styles.muted}>
                    {h.kind === 'returned' ? t('returns.tab_returned') : t('returns.tab_stock_in')}: {h.at}
                    {h.by ? ` · ${h.by}` : ''}
                  </Text>
                ))}
                <View style={styles.row}>
                  <Button title={t('returns.orderDetail')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/order/[id]', params: { id: r.orderId } })} />
                  <Button title={t('returns.stockInfo')} variant="outline" size="sm" onPress={() => setInfo(r)} />
                </View>
              </Card>
            );
          }}
        />
      )}
      {info ? <StockInfoSheet row={info} onClose={() => setInfo(null)} onDone={() => { setInfo(null); void load(0); }} /> : null}
    </SafeAreaView>
  );
}

function StockInfoSheet({ row, onClose, onDone }: { row: ReturnRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const writer = useRecordWriter();
  const { state } = useOffline();
  const waiting = hasPending(state.commands, 'return', row.id);
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState<StockInSlot[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSlots((await api.call<{ result?: StockInSlot[] }>('GET', `/api/pos/return/stock-in-slot?id=${encodeURIComponent(row.id)}`)).result ?? []);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, row.id]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function putBack() {
    Alert.alert(t('returns.stockInTitle'), t('returns.stockInAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('returns.yes'),
        onPress: () =>
          void (async () => {
            setBusy(true);
            try {
              // kept on the phone and sent later when kh-pos can't be reached; it puts stock back, so it is sent only once,
              // and kh-pos answering {result: false} counts as a refusal
              const how = await writer({ entity: 'return', op: 'action', recordId: row.id, method: 'POST', path: '/api/pos/return/stock-in', body: { id: row.id }, label: t('returns.returnStock'), once: true, mustBeTrue: 'result' });
              Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'returns.stockedIn'));
              onDone();
            } catch (e) {
              Alert.alert(t('returns.stockInFailed'), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          })(),
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('returns.stockInfo')} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>{t('returns.stockInHelp')}</Text>
          {slots === null ? (
            error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
          ) : (
            slots.map((x, i) => {
              const v = x.variant;
              const img = v?.basicProduct?.images?.find((im) => im.productVariantId === v?.id)?.url;
              return (
                <Card key={i} style={styles.card}>
                  <View style={styles.row}>
                    {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                    <View style={styles.flex}>
                      <Text style={styles.heading}>{v?.basicProduct?.title} ({v?.name})</Text>
                      <Text style={styles.muted}>
                        {t('returns.slot')}: {x.slot?.name} {x.slot?.posSlot ? '(POS)' : ''}
                      </Text>
                    </View>
                    <Text style={styles.code}>{x.qty}</Text>
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} variant="outline" onPress={onClose} style={styles.flex} />
          <Button title={t('returns.returnStock')} loading={busy} disabled={waiting} onPress={putBack} style={styles.flex} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  img: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  code: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  heading: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  reason: { fontSize: font.small, fontStyle: 'italic', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  more: { marginVertical: space.lg },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { draftQuery, pickingKey, portions, type DraftOrder } from '@/lib/stock-finding';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { fetchPicking, TransferSheet } from '@/ui/picking-sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Stock Finding like the kh-pos web page (Order Management > Finding and Transfer): the draft
 * orders, and for one of them where its products are. Products sitting in other slots are moved to
 * the POS slot (one by one or all), and products that need a unit conversion are converted.
 * Offline: the picking lists saved while online are shown, and a move or conversion is kept on the phone and sent once
 * when the server is back (stock figures are those of the saved list; the server checks them when it receives it).
 */
export default function StockFindingScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();

  const [typed, setTyped] = useState('');
  const [invoice, setInvoice] = useState('');
  const [orders, setOrders] = useState<DraftOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [open, setOpen] = useState<DraftOrder | null>(null);
  const run = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setInvoice(typed), 500);
    return () => clearTimeout(h);
  }, [typed]);

  const load = useCallback(async () => {
    const id = ++run.current;
    const qs = draftQuery(invoice);
    try {
      const r = await data.cachedRead('transfer-drafts', qs, async () => (await api.call<{ result?: { orders: DraftOrder[] } }>('GET', `/api/pos/order?${qs}`)).result?.orders ?? []);
      if (id !== run.current) return;
      setOrders(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
      // save the picking lists too, so an order can be opened offline
      if (!r.stale) for (const o of r.data.slice(0, 15)) void data.cachedRead('transfer-picking', pickingKey(o), () => fetchPicking(api, o)).catch(() => undefined);
    } catch (e) {
      if (id === run.current) setError(e);
    }
  }, [data, api, invoice]);

  const { online, syncVersion } = state;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, online, syncVersion]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.stockFinding')} />
      <View style={styles.filters}>
        <Text style={styles.muted}>{t('finding.help')}</Text>
        <Input value={typed} onChangeText={setTyped} placeholder={t('finding.search')} autoCorrect={false} accessibilityLabel={t('finding.search')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && orders.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.orderId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('finding.empty')} />}
          renderItem={({ item: o }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading}>#{o.invoiceNo}</Text>
                {o.transferBy ? <Badge tone="success" text={t('finding.transferred')} /> : null}
              </View>
              <Text style={styles.muted}>{o.createdAt}</Text>
              <Text style={styles.body}>
                {t('finding.products', { count: o.items?.length ?? 0 })} · {t('finding.qty', { count: portions(o) })} · {formatMoney(o.totalAmount, currency)}
              </Text>
              {o.transferBy?.fullname ? <Text style={styles.muted}>{t('finding.transferBy', { name: o.transferBy.fullname })}</Text> : null}
              <Button title={t('finding.detail')} variant="outline" size="sm" onPress={() => setOpen(o)} />
            </Card>
          )}
        />
      )}
      {open ? <TransferSheet order={open} onClose={() => { setOpen(null); void load(); }} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  right: { alignItems: 'flex-end' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  info: { fontSize: font.small, color: colors.info },
  error: { fontSize: font.small, color: colors.destructive },
  name: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  pick: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  img: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  convBox: { gap: 4 },
  sources: { paddingLeft: space.md, gap: 2, borderLeftWidth: 2, borderLeftColor: colors.border },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

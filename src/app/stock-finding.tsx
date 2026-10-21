import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { conversionBody, conversionDone, conversionInfo, conversionProblem, draftQuery, pickImage, pickingQuery, portions, sortPicks, transferBody, variantName, type DraftOrder, type PickItem } from '@/lib/stock-finding';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Stock Finding like the kh-pos web page (Order Management > Finding and Transfer): the draft
 * orders, and for one of them where its products are. Products sitting in other slots are moved to
 * the POS slot (one by one or all), and products that need a unit conversion are converted. Needs the server.
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

function TransferSheet({ order, onClose }: { order: DraftOrder; onClose: () => void }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [posSlotId, setPosSlotId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const lines = (order.items ?? []).map((i) => ({ variantId: i.variantId, qty: i.qty }));
      const r = await api.call<{ result?: PickItem[] }>('GET', `/api/replenishment/new/stock-picking-list?${pickingQuery(lines)}`);
      setItems(r.result ?? []);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, order]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
    if (user?.currentWarehouseId) api.posInfo(user.currentWarehouseId).then((p) => setPosSlotId(p.posSlotId), () => undefined);
  }, [loadList, api, user?.currentWarehouseId]);

  const groups = sortPicks(items ?? []);
  // like the web, anyone who can open the page can use its buttons
  const may = true;

  function transferAll() {
    Alert.alert(t('finding.confirmTitle'), t('finding.confirmAsk', { count: groups.transfer.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('finding.transfer'),
        onPress: () =>
          guard(async () => {
            setBusy(true);
            let failed = false;
            for (const x of groups.transfer) {
              try {
                await api.call('POST', '/api/inventory/transfer', transferBody(x, posSlotId, order.orderId));
              } catch {
                failed = true;
              }
            }
            setBusy(false);
            Alert.alert(failed ? t('finding.someFailed') : t('finding.transferred_all'));
            await loadList();
          }),
      },
    ]);
  }

  async function convertOne(x: PickItem): Promise<void> {
    const bad = conversionProblem(x);
    if (bad) {
      Alert.alert(t(bad === 'mixed' ? 'finding.badMixed' : 'finding.badSources'));
      return;
    }
    try {
      await api.call('POST', '/api/unit-conversion', conversionBody(x, posSlotId));
      const d = conversionDone(x);
      Alert.alert(t('finding.converted', { qty: d.qty, from: d.from, to: d.to }));
    } catch (e) {
      Alert.alert(t('finding.convertFailed'), e instanceof Error ? e.message : undefined);
    }
  }

  function convert(x: PickItem) {
    guard(async () => {
      setBusy(true);
      await convertOne(x);
      setBusy(false);
      await loadList();
    });
  }

  function convertAll() {
    guard(async () => {
      setBusy(true);
      for (const x of groups.convert) await convertOne(x);
      setBusy(false);
      await loadList();
    });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('finding.sheetTitle', { no: order.invoiceNo })} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.md }]}>
          {items === null ? (
            error ? <ErrorState error={error} onRetry={() => void loadList()} /> : <LoadingState />
          ) : items.length === 0 || (groups.transfer.length + groups.convert.length + groups.noStock.length + groups.available.length === 0) ? (
            <EmptyState title={t('finding.allReady')} />
          ) : null}

          {groups.transfer.length > 0 ? (
            <Card style={{ ...styles.card, backgroundColor: colors.warningBg }}>
              <View style={styles.row}>
                <Text style={styles.heading}>{t('finding.toTransfer')} · {groups.transfer.length}</Text>
                {may ? <Button title={t('finding.transferAll')} size="sm" loading={busy} disabled={!posSlotId} onPress={transferAll} /> : null}
              </View>
              <Text style={styles.muted}>{t('finding.toTransferHint')}</Text>
              {groups.transfer.map((x, i) => (
                <Pick key={i} item={x} showSlot />
              ))}
            </Card>
          ) : null}

          {groups.convert.length > 0 ? (
            <Card style={{ ...styles.card, backgroundColor: colors.infoBg }}>
              <View style={styles.row}>
                <Text style={styles.heading}>{t('finding.toConvert')} · {groups.convert.length}</Text>
                {may ? <Button title={t('finding.convertAll')} variant="outline" size="sm" loading={busy} disabled={!posSlotId} onPress={convertAll} /> : null}
              </View>
              <Text style={styles.muted}>{t('finding.toConvertHint')}</Text>
              {groups.convert.map((x, i) => {
                const open = expanded.includes(i);
                const details = (x.breakdownStockInfo?.length ?? 0) + (x.repackStockInfo?.length ?? 0) > 0;
                return (
                  <View key={i} style={styles.convBox}>
                    <Pick item={x} badge={x.todoType} />
                    {details ? <Button title={`${open ? '▾' : '▸'} ${conversionInfo(x)}`} variant="ghost" size="sm" onPress={() => setExpanded((e) => (open ? e.filter((k) => k !== i) : [...e, i]))} /> : <Text style={styles.info}>{conversionInfo(x)}</Text>}
                    {open ? (
                      <View style={styles.sources}>
                        {x.breakdownStockInfo?.length ? <Text style={styles.label}>{t('finding.breakdownSources')}</Text> : null}
                        {x.breakdownStockInfo?.map((s, k) => (
                          <Text key={`b${k}`} style={styles.muted}>• {s.qty}x {variantName(s.variant)}{s.slot?.name ? ` • ${s.slot.name}` : ''}</Text>
                        ))}
                        {x.repackStockInfo?.length ? <Text style={styles.label}>{t('finding.repackSources')}</Text> : null}
                        {x.repackStockInfo?.map((s, k) => (
                          <Text key={`r${k}`} style={styles.muted}>• {s.qty}x {variantName(s.variant)}{s.slot?.name ? ` • ${s.slot.name}` : ''}</Text>
                        ))}
                      </View>
                    ) : null}
                    {may ? <Button title={t('finding.convert')} variant="outline" size="sm" disabled={busy || !posSlotId} onPress={() => convert(x)} /> : null}
                  </View>
                );
              })}
            </Card>
          ) : null}

          {groups.noStock.length > 0 ? (
            <Card style={{ ...styles.card, backgroundColor: colors.destructiveBg }}>
              <Text style={styles.heading}>{t('finding.unavailable')} · {groups.noStock.length}</Text>
              <Text style={styles.muted}>{t('finding.unavailableHint')}</Text>
              {groups.noStock.map((x, i) => (
                <Pick key={i} item={x} showMessage />
              ))}
            </Card>
          ) : null}

          {groups.available.length > 0 ? (
            <Card style={{ ...styles.card, backgroundColor: colors.successBg }}>
              <Text style={styles.heading}>{t('finding.available')} · {groups.available.length}</Text>
              <Text style={styles.muted}>{t('finding.availableHint')}</Text>
              {groups.available.map((x, i) => (
                <Pick key={i} item={x} />
              ))}
            </Card>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} variant="outline" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Pick({ item, showSlot, showMessage, badge }: { item: PickItem; showSlot?: boolean; showMessage?: boolean; badge?: string }) {
  const { t } = useTranslation();
  const img = pickImage(item);
  return (
    <View style={styles.pick}>
      {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={2}>{item.variant?.basicProduct?.title}</Text>
        <Text style={styles.muted}>
          {variantName(item.variant)}
          {showSlot && item.slot ? ` • ${item.slot.name}` : ''}
        </Text>
        {badge ? <Badge tone="outline" text={badge} /> : null}
        {showMessage && item.message ? <Text style={styles.error}>{item.message}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.name}>{item.qty}</Text>
        {item.stock > 0 ? <Text style={styles.muted}>{t('finding.stock', { count: item.stock })}</Text> : null}
      </View>
    </View>
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

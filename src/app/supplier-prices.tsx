import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages, type SupplierRow } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { emptyPriceForm, hasFilters, PAGE, priceCreateBody, priceFormOf, priceImage, priceProblem, priceQuery, priceUpdateBody, productName, scheduledPriceText, type Order, type PriceFormData, type PriceItem } from '@/lib/supplier-prices';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumInput } from '@/ui/product-form/parts';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Supplier product prices like the kh-pos web page (Supply > Supplier product price): what each
 * supplier charges for each product variant and any scheduled later price. Search by supplier or
 * product, filter by supplier and product, order by price, add, edit (price and scheduled price) and delete.
 */
export default function SupplierPricesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();
  const { currency } = useBranch();

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);
  const [order, setOrder] = useState<Order>('asc');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [rows, setRows] = useState<PriceItem[]>([]);
  const listed = useRecordRows(rows, 'supplier-price', (p: PriceItem) => p.id ?? '') ?? [];
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ id: string | null; form: PriceFormData } | null>(null);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setSearch(typed), 400);
    return () => clearTimeout(h);
  }, [typed]);

  useEffect(() => {
    data.cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRow>(async (o, l) => (await api.call<{ result: { data: SupplierRow[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setSuppliers(r.data), () => undefined);
  }, [data, api]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const qs = priceQuery({ search, supplierId, productVariantId: product?.id ?? '', order, limit: PAGE, offset });
      try {
        const r = await data.cachedRead('supplier-prices', qs, async () => (await api.call<{ result?: { data: PriceItem[]; total: number } }>('GET', `/api/supplier/product-price?${qs}`)).result ?? { data: [], total: 0 });
        if (id !== request.current) return;
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, search, supplierId, product, order],
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

  const mayAdd = can(user, 'supplier', 'create');
  const mayEdit = can(user, 'supplier', 'update');
  const mayDelete = can(user, 'supplier', 'delete');

  function reset() {
    setTyped('');
    setSearch('');
    setSupplierId('');
    setProduct(null);
  }

  function save() {
    const e = editing!;
    const bad = priceProblem(e.form);
    setProblem(bad);
    if (bad) return;
    // kept on the phone and sent later when kh-pos can't be reached. A new price is sent only once (kh-pos makes its id)
    // and appears in the list after it has been sent; a changed one shows its new price at once.
    void (async () => {
      setBusy(true);
      try {
        const how = e.id
          ? await writer({ entity: 'supplier-price', op: 'update', recordId: e.id, method: 'PUT', path: '/api/supplier/product-price', body: priceUpdateBody(e.id, e.form), label: e.form.productTitle, row: { price: e.form.price, scheduledPrice: e.form.scheduledPrice, scheduledAt: e.form.scheduledAt || null } })
          : await writer({ entity: 'supplier-price', op: 'create', recordId: `new:${e.form.supplierId}:${e.form.productVariantId}`, method: 'POST', path: '/api/supplier/product-price', body: priceCreateBody(e.form), label: e.form.productTitle, once: true });
        setEditing(null);
        if (how === 'queued') Alert.alert(t('offline.savedOffline'));
        await load(0);
      } catch (err) {
        Alert.alert(t('sprice.saveFailed'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  function remove(p: PriceItem) {
    Alert.alert(t('sprice.deleteTitle'), t('sprice.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await writer({ entity: 'supplier-price', op: 'delete', recordId: p.id!, method: 'DELETE', path: '/api/supplier/product-price', body: { id: p.id }, label: productName(p) });
              await load(0);
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          })(),
      },
    ]);
  }

  const f = editing?.form;
  const set = (patch: Partial<PriceFormData>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.supplierPrices')} right={mayAdd ? <Button title={`+ ${t('sprice.add')}`} size="sm" onPress={() => { setProblem(null); setEditing({ id: null, form: emptyPriceForm() }); }} /> : undefined} />
      <View style={styles.filters}>
        <Input value={typed} onChangeText={setTyped} placeholder={t('sprice.search')} autoCorrect={false} accessibilityLabel={t('sprice.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t('plist.allSuppliers')} selected={supplierId === ''} onPress={() => setSupplierId('')} />
          {suppliers.map((s) => (
            <Chip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(supplierId === s.id ? '' : s.id)} />
          ))}
        </ScrollView>
        <View style={styles.row}>
          <Button title={product ? product.title : t('sprice.pickProduct')} variant="outline" size="sm" onPress={() => setPicking(true)} style={styles.flex} />
          {product ? <Button title="✕" variant="ghost" size="sm" onPress={() => setProduct(null)} /> : null}
        </View>
        <View style={styles.row}>
          <Chip label={t('sprice.lowHigh')} selected={order === 'asc'} onPress={() => setOrder('asc')} />
          <Chip label={t('sprice.highLow')} selected={order === 'desc'} onPress={() => setOrder('desc')} />
          <View style={styles.flex} />
          <Button title={t('sprice.reset')} variant="outline" size="sm" disabled={!hasFilters({ search: typed, supplierId, productVariantId: product?.id ?? '' })} onPress={reset} />
        </View>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(p, i) => p.id ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || rows.length >= total) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('sprice.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('sprice.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item: p, index }) => {
            const img = priceImage(p);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.no}>{index + 1}</Text>
                  {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>{productName(p)}</Text>
                    <Text style={styles.muted}>{p.variant?.sku}</Text>
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.body}>{p.supplier?.name}</Text>
                    <Text style={styles.muted}>{p.supplier?.contactPhone}</Text>
                  </View>
                  <Badge tone="info" text={`${currency}${Number(p.price).toFixed(2)}`} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>{t('sprice.scheduledPrice')}</Text>
                  {p.scheduledPrice ? <Badge tone="destructive" text={scheduledPriceText(p, currency)} /> : <Text style={styles.muted}>--</Text>}
                  <Text style={styles.muted}>{t('sprice.scheduledAt')}: {p.scheduledAt ? p.scheduledAt.slice(0, 10) : '--'}</Text>
                </View>
                <View style={styles.row}>
                  {mayEdit && p.id ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setProblem(null); setEditing({ id: p.id!, form: priceFormOf(p) }); }} /> : null}
                  {mayDelete && p.id ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(p)} /> : null}
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {editing && f ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{editing.id ? t('sprice.editTitle') : t('sprice.createTitle')}</Text>
                <Text style={styles.muted}>{t('sprice.formHint')}</Text>

                <Text style={styles.label}>{t('pform.supplier')}</Text>
                <View style={styles.chips}>
                  {suppliers
                    .filter((s) => !editing.id || s.id === f.supplierId)
                    .map((s) => (
                      <Chip key={s.id} label={s.name} selected={f.supplierId === s.id} onPress={() => (editing.id ? undefined : set({ supplierId: s.id }))} />
                    ))}
                </View>
                {problem === 'supplier' ? <Text style={styles.error}>{t('sprice.error_supplier')}</Text> : null}

                <Text style={styles.label}>{t('sprice.product')}</Text>
                {editing.id ? <Text style={styles.body}>{f.productTitle}</Text> : <Button title={f.productTitle || t('sprice.pickProduct')} variant="outline" onPress={() => setPicking(true)} />}
                {problem === 'product' ? <Text style={styles.error}>{t('sprice.error_product')}</Text> : null}

                <NumInput label={`${t('sprice.price')} *`} value={f.price} placeholder="0.00" onChange={(n) => set({ price: n ?? 0 })} />
                {problem === 'price' ? <Text style={styles.error}>{t('sprice.error_price')}</Text> : null}

                {editing.id ? (
                  <>
                    <NumInput label={t('sprice.scheduledPrice')} value={f.scheduledPrice} placeholder="0.00" onChange={(n) => set({ scheduledPrice: n })} />
                    <Text style={styles.label}>{t('sprice.scheduledDate')}</Text>
                    <Input value={f.scheduledAt} onChangeText={(v) => set({ scheduledAt: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('sprice.scheduledDate')} />
                    {problem === 'scheduledPrice' || problem === 'scheduledAt' ? <Text style={styles.error}>{t(`sprice.error_${problem}`)}</Text> : null}
                  </>
                ) : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {picking ? (
        <VariantPicker
          api={api}
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setPicking(false);
            if (editing) set({ productVariantId: v.variantId, productTitle: v.name });
            else setProduct({ id: v.variantId, title: v.name });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chipRow: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  no: { fontSize: font.small, color: colors.mutedForeground, minWidth: 18 },
  img: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  body: { fontSize: font.body, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  more: { marginVertical: space.lg },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages, type CategoryRow, type SupplierRow } from '@/lib/catalog';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { BranchRow } from '@/lib/org';
import {
  canManageProducts,
  componentChoices,
  firstPrice,
  hasBranchSwitches,
  hasConversion,
  listQuery,
  needsComponentChoice,
  productImage,
  productIsLow,
  productStock,
  variantImage,
  variantIsLow,
  variantTitle,
  VARIANT_ACTIONS,
  type ListProduct,
  type ListVariant,
  type VariantAction,
} from '@/lib/product-list';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { LabelModal, SupplierPriceModal, TransactionsModal } from '@/ui/product-list/variant-modals';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;

type Open = { kind: 'menu' | 'transaction' | 'supplierPrice' | 'label' | 'components'; product: ListProduct; variant: ListVariant; action?: VariantAction } | null;

/**
 * The Product page of the kh-pos web app: search by title or barcode, filter by supplier and category,
 * a row per product (stock, price, category, created, Low Stock) that opens to its variants, with the
 * variant actions (Transaction, Count, Stock In, Stock Out, Set Supplier Price, Print Label), Edit and
 * Delete. Adding and editing are for the main branch only; a branch that follows the main branch's
 * product groups can switch For Sale, a variant's visibility and its menu tags for itself.
 */
export default function ProductsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const { currency, warehouseId } = useBranch();
  const writer = useRecordWriter();

  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [byBarcode, setByBarcode] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [branch, setBranch] = useState<BranchRow | null>(null);
  const [items, setItems] = useState<ListProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Open>(null);
  const [forSale, setForSale] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [tags, setTags] = useState<Record<string, { isPopular: boolean; isNew: boolean; isMostOrder: boolean }>>({});
  const request = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setText(search), 350);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    data.cachedRead('categories-full', warehouseId, () => fetchAllPages<CategoryRow>(async (o, l) => (await api.call<{ result: { data: CategoryRow[]; total: number } }>('GET', `/api/category?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setCategories(r.data), () => undefined);
    data.cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRow>(async (o, l) => (await api.call<{ result: { data: SupplierRow[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setSuppliers(r.data), () => undefined);
    data.cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setBranch(r.data.find((b) => b.id === warehouseId) ?? null), () => undefined);
  }, [data, api, warehouseId, state.online]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const qs = listQuery({ text: byBarcode ? '' : text, barcode: byBarcode ? text : '', supplierId, categoryId, limit: PAGE, offset });
      try {
        const r = await data.cachedRead('products', qs, async () => (await api.call<{ result: { data: ListProduct[]; total: number } }>('GET', `/api/product-v2?${qs}`)).result);
        if (id !== request.current) return;
        setItems((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data.filter((p) => !prev.some((q) => q.id === p.id))]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
        if (offset === 0 && byBarcode && text.trim()) setExpanded(new Set(r.data.data.map((p) => p.id))); // a barcode search shows the variants
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, text, byBarcode, supplierId, categoryId],
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

  const isMain = branch ? !!branch.isMain : (user?.warehouse as { isMain?: boolean } | null | undefined)?.isMain !== false;
  const switches = hasBranchSwitches(branch);
  const mayAdd = canManageProducts(isMain, can(user, 'product', 'create'));
  const mayEdit = canManageProducts(isMain, can(user, 'product', 'update'));
  const mayDelete = can(user, 'product', 'delete');

  function confirmDelete(p: ListProduct) {
    Alert.alert(t('products.deleteConfirm', { name: p.title ?? '' }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              // sent at once, or kept on the phone and sent when kh-pos can be reached
              const how = await writer({ entity: 'product', op: 'delete', recordId: p.id, method: 'DELETE', path: '/api/product-v2', body: { id: p.id }, label: p.title ?? '' });
              if (how === 'queued') Alert.alert(t('offline.savedOffline'));
              await load(0);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          })(),
      },
    ]);
  }

  /** Runs a branch switch: confirmed, shown at once, undone if the server refuses. */
  function switchWithConfirm(title: string, message: string, ok: string, apply: () => void, undo: () => void, call: () => Promise<unknown>) {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: ok,
        onPress: () => {
          apply();
          call().then(() => load(0), () => {
            undo();
            Alert.alert(t('errors.server'));
          });
        },
      },
    ]);
  }

  function runAction(p: ListProduct, v: ListVariant, action: VariantAction, componentId?: string, componentName?: string) {
    setOpen(null);
    const stock = (mode: string, variantId: string, name: string) => router.push({ pathname: '/stock-counting', params: { variantId, productId: p.id, name, mode } });
    const name = `${p.title ?? ''}${v.name && v.name !== 'ns' ? ` (${v.name})` : ''}`;
    if (action === 'transaction') setOpen({ kind: 'transaction', product: p, variant: v });
    else if (action === 'supplierPrice') setOpen({ kind: 'supplierPrice', product: p, variant: v });
    else if (action === 'printLabel') setOpen({ kind: 'label', product: p, variant: v });
    else if (needsComponentChoice(v, action) && !componentId) setOpen({ kind: 'components', product: p, variant: v, action });
    else stock(action === 'count' ? 'count' : action === 'stockIn' ? 'in' : 'out', componentId ?? v.id, componentName ?? name);
  }

  const toggleExpanded = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderVariant(p: ListProduct, v: ListVariant) {
    const img = variantImage(p, v.id);
    const low = variantIsLow(v);
    const tag = tags[v.id] ?? { isPopular: !!v.isPopular, isNew: !!v.isNew, isMostOrder: !!v.isMostOrder };
    const isVisible = visible[v.id] ?? v.visible !== false;
    return (
      <View key={v.id} style={styles.variant}>
        <View style={styles.row}>
          {img ? <Image source={{ uri: img }} style={styles.vimg} resizeMode="contain" /> : null}
          <View style={styles.flex}>
            <Text style={styles.vname}>{variantTitle(v)}</Text>
            <Text style={styles.muted}>SKU: {v.barcode || 'N/A'}</Text>
          </View>
          {v.isComposite ? <Badge tone="outline" text={t('pform.composite')} /> : null}
          <Pressable onPress={() => setOpen({ kind: 'menu', product: p, variant: v })} accessibilityRole="button" accessibilityLabel={t('plist.actions')} hitSlop={8}>
            <Text style={styles.dots}>⋯</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Text style={[styles.muted, low && styles.low]}>{t('plist.stock')}: {v.stock ?? 0}</Text>
          <Text style={styles.price}>{formatMoney(v.price ?? 0, currency)}</Text>
        </View>
        {switches ? (
          <View style={styles.switches}>
            <View style={styles.row}>
              <Switch
                value={isVisible}
                onValueChange={(on) =>
                  switchWithConfirm(
                    on ? t('plist.showVariant') : t('plist.hideVariant'),
                    t(on ? 'plist.showVariantAsk' : 'plist.hideVariantAsk', { name: variantTitle(v) }),
                    on ? t('plist.show') : t('plist.hide'),
                    () => setVisible((s) => ({ ...s, [v.id]: on })),
                    () => setVisible((s) => ({ ...s, [v.id]: !on })),
                    () => writer({ entity: 'product-switch', op: 'action', recordId: `visible:${v.id}`, method: 'PUT', path: '/api/product-v2/warehouse-visibilty/product-variant', body: { productVariantId: v.id, isVisible: on }, label: variantTitle(v) }),
                  )
                }
              />
              <Text style={styles.muted}>{isVisible ? t('plist.visible') : t('plist.hidden')}</Text>
            </View>
            <View style={styles.chips}>
              {(['isPopular', 'isNew', 'isMostOrder'] as const).map((k) => (
                <Chip
                  key={k}
                  label={t(k === 'isPopular' ? 'pform.popular' : k === 'isNew' ? 'pform.new' : 'plist.bestSeller')}
                  selected={tag[k]}
                  onPress={() => {
                    const before = tag;
                    setTags((s) => ({ ...s, [v.id]: { ...tag, [k]: !tag[k] } }));
                    writer({ entity: 'product-switch', op: 'action', recordId: `badge:${v.id}:${k}`, method: 'PUT', path: '/api/product-v2/warehouse-visibilty/product-variant-badges', body: { productVariantId: v.id, [k]: !tag[k] }, label: variantTitle(v) }).catch(() => setTags((s) => ({ ...s, [v.id]: before })));
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  function renderProduct(p: ListProduct) {
    const img = productImage(p);
    const stock = productStock(p);
    const low = productIsLow(p);
    const isOpen = expanded.has(p.id);
    const sale = forSale[p.id] ?? p.isForSale !== false;
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
          <View style={styles.flex}>
            <Text style={styles.heading} numberOfLines={2}>
              {p.title}
            </Text>
            <View style={styles.chips}>
              <Badge tone="outline" text={t('plist.variants', { count: p.productVariants?.length ?? 0 })} />
              {low ? <Badge tone="destructive" text={t('plist.lowStock')} /> : null}
              {hasConversion(p) ? <Badge tone="info" text={t('plist.conversion')} /> : null}
            </View>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={[styles.muted, low && styles.low]}>
            {t('plist.stock')}: {stock === null ? 'N/A' : stock}
          </Text>
          <Text style={styles.price}>{formatMoney(firstPrice(p), currency)}</Text>
        </View>
        <Text style={styles.muted}>
          {(p.productCategories ?? []).map((c) => c.title).filter(Boolean).join(', ') || t('plist.noCategory')}
          {p.createdAt ? ` · ${p.createdAt.slice(0, 10)}` : ''}
        </Text>
        {switches ? (
          <View style={styles.row}>
            <Switch
              value={sale}
              onValueChange={(on) =>
                switchWithConfirm(
                  on ? t('plist.enableForSale') : t('plist.disableForSale'),
                  t(on ? 'plist.enableForSaleAsk' : 'plist.disableForSaleAsk', { name: p.title ?? '' }),
                  on ? t('plist.enable') : t('plist.disable'),
                  () => setForSale((s) => ({ ...s, [p.id]: on })),
                  () => setForSale((s) => ({ ...s, [p.id]: !on })),
                  () => writer({ entity: 'product-switch', op: 'action', recordId: `sale:${p.id}`, method: 'PUT', path: '/api/product-v2/warehouse-visibilty/product', body: { productId: p.id, isForSale: on }, label: p.title ?? '' }),
                )
              }
            />
            <Text style={styles.muted}>{t('pform.forSale')}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Button title={isOpen ? t('plist.hideVariants') : t('plist.showVariants')} variant="outline" size="sm" onPress={() => toggleExpanded(p.id)} />
          {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/product-edit/[id]', params: { id: p.id } })} /> : null}
          {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => confirmDelete(p)} /> : null}
        </View>
        {isOpen ? <View style={styles.variants}>{(p.productVariants ?? []).map((v) => renderVariant(p, v))}</View> : null}
      </Card>
    );
  }

  const label = (a: VariantAction) => t(`plist.action_${a}`);
  const o = open;
  const title = o ? `${o.product.title ?? ''}${o.variant.name && o.variant.name !== 'ns' ? ` (${variantTitle(o.variant)})` : ''}` : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={t('more.products')}
        right={
          mayAdd ? (
            <View style={styles.headerButtons}>
              <Button title={t('import.short')} variant="outline" size="sm" onPress={() => router.push('/product-import')} />
              <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => router.push({ pathname: '/product-edit/[id]', params: { id: 'new' } })} />
            </View>
          ) : undefined
        }
      />
      <View style={styles.filters}>
        <View style={styles.row}>
          <Input style={styles.flex} value={search} onChangeText={setSearch} placeholder={byBarcode ? t('plist.searchBarcode') : t('products.search')} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('products.search')} />
          <Chip label={t('plist.barcode')} selected={byBarcode} onPress={() => setByBarcode((b) => !b)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t('menu.all')} selected={categoryId === ''} onPress={() => setCategoryId('')} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.title} selected={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? '' : c.id)} />
          ))}
        </ScrollView>
        {suppliers.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label={t('plist.allSuppliers')} selected={supplierId === ''} onPress={() => setSupplierId('')} />
            {suppliers.map((s) => (
              <Chip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(supplierId === s.id ? '' : s.id)} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {loading ? (
        <LoadingState />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || items.length >= total) return;
            setMoreLoading(true);
            await load(items.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('plist.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('products.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          renderItem={({ item }) => renderProduct(item)}
        />
      )}

      <Modal visible={o?.kind === 'menu'} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(null)}>
          <View style={styles.sheet}>
            <Text style={styles.heading}>{title}</Text>
            {o ? VARIANT_ACTIONS.map((a) => <Button key={a} title={label(a)} variant="outline" onPress={() => runAction(o.product, o.variant, a)} />) : null}
            <Button title={t('common.cancel')} variant="ghost" onPress={() => setOpen(null)} />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={o?.kind === 'components'} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(null)}>
          <View style={styles.sheet}>
            <Text style={styles.heading}>{t('plist.compositeProduct')}</Text>
            <Text style={styles.muted}>{t(o?.action === 'count' ? 'plist.compositeCountAsk' : 'plist.compositeStockInAsk')}</Text>
            {o ? componentChoices(o.variant).map((c) => <Button key={c.variantId} title={c.name} variant="outline" onPress={() => runAction(o.product, o.variant, o.action!, c.variantId, c.name)} />) : null}
            <Button title={t('common.cancel')} variant="ghost" onPress={() => setOpen(null)} />
          </View>
        </Pressable>
      </Modal>

      {o?.kind === 'transaction' ? <TransactionsModal api={api} variantId={o.variant.id} title={title} onClose={() => setOpen(null)} /> : null}
      {o?.kind === 'supplierPrice' ? <SupplierPriceModal api={api} data={data} variantId={o.variant.id} title={title} currency={currency} canEdit={mayEdit || can(user, 'supplier', 'update')} onClose={() => setOpen(null)} /> : null}
      {o?.kind === 'label' ? <LabelModal title={o.product.title ?? ''} variant={o.variant.name} barcode={o.variant.barcode ?? ''} price={o.variant.price ?? 0} discountedPrice={o.variant.discountedPrice} currency={currency} onClose={() => setOpen(null)} /> : null}
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  img: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  low: { color: colors.destructive, fontWeight: '700' },
  price: { fontSize: font.body, fontWeight: '700', color: colors.success },
  variants: { gap: space.sm, paddingTop: space.xs },
  variant: { gap: 4, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.muted },
  vimg: { width: 36, height: 36, borderRadius: radius.sm },
  vname: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  dots: { fontSize: 22, color: colors.mutedForeground, paddingHorizontal: 6 },
  switches: { gap: 6 },
  more: { marginVertical: space.lg },
  headerButtons: { flexDirection: 'row', gap: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});

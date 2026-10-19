import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages, type CategoryRow } from '@/lib/catalog';
import { allChange, appliesBody, appliesOn, appliesState, canLimitVariants, categoryChange, discountFormOf, discountProblem, discountSaveBody, discountText, emptyDiscountForm, matchesDiscount, productChange, tabChangesServer, variantToggle, type AppliedProduct, type AppliesRow, type AppliesState, type Change, type DiscountFormData, type DiscountItem } from '@/lib/discounts';
import { can } from '@/lib/line';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumInput } from '@/ui/product-form/parts';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Discounts like the kh-pos web Discount page (its first tab): campaigns with a name, a percentage or
 * fixed amount, a value and a description, shown with what they apply to, who made them and the branch;
 * add, edit, delete, and "Applies to Products" (all products, chosen products and their variants, or
 * chosen categories). The second tab, promotion sets, is its own screen.
 */
export default function DiscountsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { currency, warehouseId } = useBranch();

  const [rows, setRows] = useState<DiscountItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ row: DiscountItem | null; form: DiscountFormData } | null>(null);
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applies, setApplies] = useState<DiscountItem | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('discounts-page', warehouseId, () => fetchAllPages<DiscountItem>(async (o, l) => (await api.call<{ result: { data: DiscountItem[]; total: number } }>('GET', `/api/discount?limit=${Math.min(l, 100)}&offset=${o}`)).result));
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, warehouseId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, state.online, state.syncVersion]);

  const mayAdd = can(user, 'discount', 'create');
  const mayEdit = can(user, 'discount', 'update');
  const mayDelete = can(user, 'discount', 'delete');

  function save() {
    const e = editing!;
    if (discountProblem(e.form)) {
      setProblem(true);
      return;
    }
    const body = discountSaveBody(e.form, warehouseId, () => Crypto.randomUUID(), e.row ?? undefined);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.row ? 'PUT' : 'POST', '/api/discount', body);
        setEditing(null);
        await load();
      } catch (err) {
        Alert.alert(e.row ? t('discounts.saveFailedEdit') : t('discounts.saveFailedCreate'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(d: DiscountItem) {
    Alert.alert(t('discounts.deleteTitle'), t('discounts.deleteAsk', { name: d.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/discount', { id: d.id });
              await load();
            } catch (err) {
              Alert.alert(t('discounts.deleteFailed'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const shown = (rows ?? []).filter((d) => matchesDiscount(d, search));
  const f = editing?.form;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.discounts')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => { setProblem(false); setEditing({ row: null, form: emptyDiscountForm() }); }} /> : undefined} />
      <View style={styles.tabs}>
        <Chip label={t('discounts.tabDiscounts')} selected onPress={() => undefined} />
        <Chip label={t('discounts.tabPromotionSets')} selected={false} onPress={() => router.replace('/promotion-sets')} />
      </View>
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item: d }) => {
            const on = appliesOn(d);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.heading, styles.flex]}>{d.title}</Text>
                  <Text style={styles.value}>{discountText(d, currency)}</Text>
                </View>
                {d.description ? <Text style={styles.muted}>{d.description}</Text> : null}
                <View style={styles.chips}>
                  <Badge tone={on.kind === 'all' ? 'success' : 'info'} text={t(`discounts.on_${on.kind}`, { count: on.count })} />
                  {d.warehouse?.name ? <Badge tone="outline" text={d.warehouse.name} /> : null}
                </View>
                <Text style={styles.muted}>{[d.createdAt?.slice(0, 10), d.createdBy?.fullname || d.createdBy?.username].filter(Boolean).join(' · ')}</Text>
                <View style={styles.chips}>
                  {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setProblem(false); setEditing({ row: d, form: discountFormOf(d) }); }} /> : null}
                  <Button title={t('discounts.appliesTo')} variant="outline" size="sm" onPress={() => setApplies(d)} />
                  {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(d)} /> : null}
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
                <Text style={styles.title}>{t('discounts.formTitle')}</Text>
                <Text style={styles.muted}>{t('discounts.formHint')}</Text>
                <Input value={f.title} onChangeText={(v) => setEditing({ ...editing, form: { ...f, title: v } })} placeholder={t('discounts.campaignName')} accessibilityLabel={t('discounts.campaignName')} />
                {problem && discountProblem(f) === 'title' ? <Text style={styles.error}>{t('admin.required')}</Text> : null}
                <View style={styles.chips}>
                  <Chip label={t('discounts.percentage')} selected={f.discountType === 'PERCENTAGE'} onPress={() => setEditing({ ...editing, form: { ...f, discountType: 'PERCENTAGE' } })} />
                  <Chip label={t('discounts.fixedAmount', { currency })} selected={f.discountType === 'AMOUNT'} onPress={() => setEditing({ ...editing, form: { ...f, discountType: 'AMOUNT' } })} />
                </View>
                <NumInput label={t('discounts.value')} value={f.value} onChange={(n) => setEditing({ ...editing, form: { ...f, value: n ?? 0 } })} />
                <Text style={styles.muted}>{t(f.discountType === 'AMOUNT' ? 'discounts.valueHintAmount' : 'discounts.valueHintPercent', { currency })}</Text>
                {problem && (discountProblem(f) === 'value' || discountProblem(f) === 'percent') ? <Text style={styles.error}>{t(discountProblem(f) === 'percent' ? 'discounts.percentMax' : 'discounts.valueMin')}</Text> : null}
                <Input value={f.description} onChangeText={(v) => setEditing({ ...editing, form: { ...f, description: v } })} placeholder={t('discounts.descriptionHint')} multiline style={styles.multi} accessibilityLabel={t('discounts.description')} />
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {applies ? <AppliesModal api={api} discount={applies} canEdit={mayEdit} onClose={() => { setApplies(null); void load(); }} /> : null}
    </SafeAreaView>
  );
}

/** "Applies Discount": All Products, chosen Products (and limiting them to some variants), or chosen Categories. */
function AppliesModal({ api, discount, canEdit, onClose }: { api: KhPosApi; discount: DiscountItem; canEdit: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useOffline();
  const { currency, warehouseId } = useBranch();
  const guard = useOnlineOnly();
  const [state, setState] = useState<AppliesState | null>(null);
  const [tab, setTab] = useState<'all' | 'product' | 'category'>('product');
  const [error, setError] = useState<unknown>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const read = useCallback(
    async (setFirstTab: boolean) => {
      try {
        const r = await api.call<{ result?: AppliesRow[] }>('GET', `/api/discount/applies?id=${encodeURIComponent(discount.id)}`);
        const s = appliesState(r.result ?? []);
        setState(s);
        if (setFirstTab) setTab(s.tab);
      } catch (e) {
        setError(e);
      }
    },
    [api, discount.id],
  );

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read(true);
    data.cachedRead('categories-full', warehouseId, () => fetchAllPages<CategoryRow>(async (o, l) => (await api.call<{ result: { data: CategoryRow[]; total: number } }>('GET', `/api/category?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setCategories(r.data), () => undefined);
  }, [read, data, api, warehouseId]);

  /** Sends the changes one after another (the server handles each as its own request), then reads again. */
  function send(changes: Change[], afterTab?: 'all' | 'product' | 'category') {
    guard(async () => {
      setBusy(true);
      try {
        for (const c of changes) await api.call('POST', '/api/discount/applies', appliesBody([c]));
        await read(false);
        if (afterTab) setTab(afterTab);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function chooseTab(next: 'all' | 'product' | 'category') {
    if (next === tab) return;
    if (tabChangesServer(tab, next)) send([allChange(discount.id, next === 'all')], next);
    else setTab(next);
  }

  const q = catSearch.trim().toLowerCase();
  const chosen = new Set((state?.categories ?? []).map((c) => c.id));

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title}>{t('discounts.appliesTitle')}</Text>
            <Text style={styles.muted}>{discount.title}</Text>
          </View>
          <Button title={t('common.close')} variant="ghost" size="sm" onPress={onClose} />
        </View>
        {state === null ? (
          error ? <ErrorState error={error} onRetry={() => void read(true)} /> : <LoadingState />
        ) : (
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {canEdit ? (
              <View style={styles.chips}>
                <Chip label={t('discounts.tabAll')} selected={tab === 'all'} onPress={() => chooseTab('all')} />
                <Chip label={t('discounts.tabProduct')} selected={tab === 'product'} onPress={() => chooseTab('product')} />
                <Chip label={t('discounts.tabCategory')} selected={tab === 'category'} onPress={() => chooseTab('category')} />
              </View>
            ) : null}
            {busy ? <Text style={styles.muted}>{t('discounts.working')}</Text> : null}

            {tab === 'all' ? <Text style={styles.body}>{t('discounts.allHint')}</Text> : null}

            {tab === 'product' ? (
              <>
                {canEdit ? <Button title={`+ ${t('discounts.addProduct')}`} variant="outline" onPress={() => setPicking(true)} /> : null}
                <Text style={styles.heading}>{t('discounts.appliedProducts', { count: state.products.length })}</Text>
                {state.products.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.body}>{t('discounts.noProducts')}</Text>
                    <Text style={styles.muted}>{t('discounts.noProductsHint')}</Text>
                  </View>
                ) : null}
                {state.products.map((p) => (
                  <ProductCard key={p.id} p={p} currency={currency} canEdit={canEdit} onRemove={() => send([productChange(discount.id, p.id, false)])} onToggle={(variantId, on) => send(variantToggle(discount.id, p, variantId, on))} />
                ))}
              </>
            ) : null}

            {tab === 'category' ? (
              <>
                <Input value={catSearch} onChangeText={setCatSearch} placeholder={t('discounts.searchCategory')} autoCorrect={false} accessibilityLabel={t('discounts.searchCategory')} />
                {canEdit ? (
                  <View style={styles.chips}>
                    {categories
                      .filter((c) => !chosen.has(c.id) && (!q || c.title.toLowerCase().includes(q)))
                      .slice(0, 40)
                      .map((c) => (
                        <Chip key={c.id} label={`+ ${c.title}`} selected={false} onPress={() => send([categoryChange(discount.id, c.id, true)])} />
                      ))}
                  </View>
                ) : null}
                <Text style={styles.heading}>{t('discounts.appliedCategories', { count: state.categories.length })}</Text>
                {state.categories.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.body}>{t('discounts.noCategories')}</Text>
                    <Text style={styles.muted}>{t('discounts.noCategoriesHint')}</Text>
                  </View>
                ) : null}
                {state.categories.map((c) => (
                  <Card key={c.id} style={styles.card}>
                    <View style={styles.row}>
                      {c.imageUrl ? <Image source={{ uri: c.imageUrl }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                      <Text style={[styles.body, styles.flex]}>{c.title}</Text>
                      {canEdit ? <Button title="✕" variant="ghost" size="sm" onPress={() => send([categoryChange(discount.id, c.id, false)])} /> : null}
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
          </ScrollView>
        )}
        {picking ? (
          <VariantPicker
            api={api}
            onClose={() => setPicking(false)}
            onPick={(v) => {
              setPicking(false);
              if (state?.products.some((p) => p.id === v.productId)) {
                Alert.alert(t('discounts.alreadyApplied'));
                return;
              }
              send([productChange(discount.id, v.productId, true)]);
            }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function ProductCard({ p, currency, canEdit, onRemove, onToggle }: { p: AppliedProduct; currency: CurrencyCode; canEdit: boolean; onRemove: () => void; onToggle: (variantId: string, on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        {p.image ? <Image source={{ uri: p.image }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
        <Text style={[styles.body, styles.flex]} numberOfLines={2}>
          {p.title}
        </Text>
        {canEdit ? <Button title="✕" variant="ghost" size="sm" onPress={onRemove} /> : null}
      </View>
      {canEdit && canLimitVariants(p) ? (
        <View style={styles.variants}>
          <Text style={styles.muted}>{p.selected.length === 0 ? t('discounts.allVariants') : t('discounts.nVariants', { count: p.selected.length })}</Text>
          <View style={styles.chips}>
            {p.variants.map((v) => (
              <Chip key={v.id} label={`${v.name}${v.price != null ? ` — ${formatMoney(Number(v.price), currency)}` : ''}`} selected={p.selected.includes(v.id)} onPress={() => onToggle(v.id, !p.selected.includes(v.id))} />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tabs: { flexDirection: 'row', gap: 6, padding: space.md, paddingBottom: 0 },
  filters: { padding: space.md },
  list: { padding: space.md, paddingTop: 0, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  variants: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
  img: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700', color: colors.success },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  multi: { minHeight: 100, textAlignVertical: 'top' },
  empty: { alignItems: 'center', padding: space.md, gap: 4 },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

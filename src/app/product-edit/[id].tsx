import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CategoryRow } from '@/lib/catalog';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { canEditStructure, emptyProductForm, formFromDetail, newVariant, productBody, validateProduct, type ProductDetail, type ProductForm, type VariantForm } from '@/lib/products';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Field, Segmented } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

const newId = () => Crypto.randomUUID();

/**
 * Add or edit a product like the kh-pos web product form: name, description, categories, pictures,
 * sale flags, and each variant's name, price, cost, barcode, badges and discount. Saving needs the server.
 */
export default function ProductEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === 'new';
  const { api } = useSession();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const warehouse = useSession().user?.currentWarehouseId ?? '';

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [form, setForm] = useState<ProductForm | null>(() => (creating ? emptyProductForm(newId) : null));
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('product', id, async () => (await api.call<{ result: ProductDetail }>('GET', `/api/product-v2/${encodeURIComponent(id)}`)).result);
      setDetail(r.data);
      setForm(formFromDetail(r.data));
    } catch (e) {
      setError(e);
    }
  }, [data, api, id]);

  useEffect(() => {
    if (!creating) void load();
  }, [creating, load]);

  useEffect(() => {
    data.categories(warehouse).then(
      (r) => setCategories(r.data as unknown as CategoryRow[]),
      () => undefined,
    );
  }, [data, warehouse, state.online]);

  const set = (patch: Partial<ProductForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setVariant = (i: number, patch: Partial<VariantForm>) => setForm((f) => (f ? { ...f, variants: f.variants.map((v, k) => (k === i ? { ...v, ...patch } : v)) } : f));

  async function pick(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ base64: true, quality: 0.6, allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'] });
    const base64 = result.assets?.[0]?.base64;
    if (result.canceled || !base64) return;
    guard(async () => {
      setBusy(true);
      try {
        const fileName = `${Crypto.randomUUID()}.jpg`;
        const res = await api.call<{ url?: string }>('POST', '/api/upload', { fileName, fileContent: base64 });
        if (!res.url) throw new Error(t('products.uploadFailed'));
        setForm((f) => (f ? { ...f, images: [...f.images, res.url!] } : f));
      } catch (e) {
        Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  async function save() {
    if (!form) return;
    const bad = validateProduct(form);
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    guard(async () => {
      setBusy(true);
      try {
        const body = productBody(form, detail, newId);
        await api.call(creating ? 'POST' : 'PUT', '/api/product-v2', body);
        router.back();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
        setBusy(false);
      }
    });
  }

  if (!form) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('products.edit')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const structure = canEditStructure(detail);
  const err = (key: string) => (problem === key ? t(`products.error_${key}`) : undefined);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={creating ? t('products.add') : t('products.edit')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Field label={t('products.name')} value={form.title} onChangeText={(v) => set({ title: v })} error={err('title')} />
            <Field label={t('products.description')} value={form.description} onChangeText={(v) => set({ description: v })} multiline />
            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('products.forSale')}</Text>
              <Switch value={form.isForSale} onValueChange={(v) => set({ isForSale: v })} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>{t('products.trackStock')}</Text>
              <Switch value={form.trackStock} onValueChange={(v) => set({ trackStock: v })} />
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('products.categories')}</Text>
            <View style={styles.chips}>
              {categories.map((c) => (
                <Chip key={c.id} label={c.title} selected={form.categoryIds.includes(c.id)} onPress={() => set({ categoryIds: form.categoryIds.includes(c.id) ? form.categoryIds.filter((x) => x !== c.id) : [...form.categoryIds, c.id] })} />
              ))}
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('products.pictures')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pictures}>
              {form.images.map((url, i) => (
                <Pressable key={`${url}-${i}`} onPress={() => set({ images: form.images.filter((_, k) => k !== i) })} accessibilityRole="button" accessibilityLabel={t('products.removePicture')}>
                  <Image source={{ uri: api.imageUrl(url) ?? url }} style={styles.picture} />
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.row}>
              <Button title={t('products.library')} variant="outline" size="sm" loading={busy} onPress={() => void pick(false)} style={styles.flex} />
              <Button title={t('products.camera')} variant="outline" size="sm" loading={busy} onPress={() => void pick(true)} style={styles.flex} />
            </View>
          </Card>

          <Text style={styles.section}>{t('products.variantsTitle')}</Text>
          {err('variants') ? <Text style={styles.error}>{err('variants')}</Text> : null}
          {form.variants.map((v, i) => (
            <Card key={v.id} style={styles.card}>
              <Field
                label={t('products.variantName')}
                value={v.name}
                onChangeText={(x) => setVariant(i, { name: x })}
                editable={structure}
                error={i === problemVariant(problem, form) ? err(problem ?? '') : undefined}
              />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <NumberField label={t('products.price')} value={v.price} decimal onChange={(n) => setVariant(i, { price: n })} />
                </View>
                <View style={styles.flex}>
                  <NumberField label={t('products.cost')} value={v.purchasedCost} decimal onChange={(n) => setVariant(i, { purchasedCost: n })} />
                </View>
              </View>
              <Field label={t('products.barcode')} value={v.barcode} onChangeText={(x) => setVariant(i, { barcode: x })} autoCapitalize="none" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>{t('products.visible')}</Text>
                <Switch value={v.visible} onValueChange={(x) => setVariant(i, { visible: x })} />
              </View>
              <View style={styles.chips}>
                <Chip label={t('products.popular')} selected={v.isPopular} onPress={() => setVariant(i, { isPopular: !v.isPopular })} />
                <Chip label={t('products.new')} selected={v.isNew} onPress={() => setVariant(i, { isNew: !v.isNew })} />
                <Chip label={t('products.mostOrdered')} selected={v.isMostOrder} onPress={() => setVariant(i, { isMostOrder: !v.isMostOrder })} />
              </View>
              <Text style={styles.label}>{t('products.discount')}</Text>
              <Segmented
                options={[
                  { value: '', label: t('products.noDiscount') },
                  { value: 'PERCENTAGE', label: '%' },
                  { value: 'AMOUNT', label: '$' },
                ]}
                value={v.discountType}
                onChange={(x) => setVariant(i, { discountType: x })}
              />
              {v.discountType ? <NumberField label={t('discounts.value')} value={v.discountValue} decimal onChange={(n) => setVariant(i, { discountValue: n })} /> : null}
              {structure && form.variants.length > 1 ? <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => set({ variants: form.variants.filter((_, k) => k !== i) })} /> : null}
            </Card>
          ))}
          {structure ? <Button title={`+ ${t('products.addVariant')}`} variant="outline" onPress={() => set({ variants: [...form.variants, newVariant(newId, '')] })} /> : <Text style={styles.muted}>{t('products.lockedStructure')}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title={t('common.cancel')} variant="outline" onPress={() => router.back()} style={styles.flex} />
        <Button title={t('customize.save')} loading={busy} onPress={() => void save()} style={styles.flex} />
      </View>
    </SafeAreaView>
  );
}

/** Which variant a variant-level problem belongs to (the first one that has it). */
function problemVariant(problem: string | null, form: ProductForm): number {
  if (!problem) return -1;
  return form.variants.findIndex((v) => (problem === 'variantName' ? !v.name.trim() : problem === 'price' ? v.price < 0 : problem === 'cost' ? v.purchasedCost < 0 : problem === 'discount' ? !!v.discountType && !(v.discountValue > 0 && (v.discountType !== 'PERCENTAGE' || v.discountValue <= 100)) : problem === 'duplicateVariant' ? form.variants.filter((o) => o.name.trim().toLowerCase() === v.name.trim().toLowerCase()).length > 1 : false));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  label: { flex: 1, fontSize: font.body, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  error: { fontSize: font.small, color: colors.destructive },
  row: { flexDirection: 'row', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pictures: { gap: space.sm },
  picture: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.muted },
  remove: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.overlay, color: '#fff', fontSize: 12, paddingHorizontal: 5, borderRadius: 8, overflow: 'hidden' },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

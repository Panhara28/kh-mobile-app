import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { dayText } from '@/lib/dates';
import { applyOptions, createBody, defaultMovie, formFromDetail, isMovie, newProductForm, setCategory, updateBody, validateProduct, type Detail, type OptionForm, type ProductFormData, type ProductProblem } from '@/lib/product-form';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Button, Field } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { ConversionsSection } from '@/ui/product-form/conversions-section';
import { ImagesSection } from '@/ui/product-form/images-section';
import { MovieSection } from '@/ui/product-form/movie-section';
import { OptionsDialog } from '@/ui/product-form/options-dialog';
import { Section, ToggleRow } from '@/ui/product-form/parts';
import { CategoryPicker, SupplierPicker } from '@/ui/product-form/pickers';
import { VariantsSection, type PrinterRef } from '@/ui/product-form/variants-section';
import { colors, font, space } from '@/ui/theme';

const newId = () => Crypto.randomUUID();

/**
 * Add or edit a product with every field of the kh-pos web product form: title, supplier, category,
 * description, For Sale, Track Stock; pictures bound to variants; options and the variants made from
 * them (price, discount, barcode, low and ideal stock, purchase cost, composite components, visible,
 * menu tags, kitchen printer); unit conversions; and the movie form for the cinema category.
 * Like the web, only the main branch can add or edit products, and saving needs the server.
 */
export default function ProductEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === 'new';
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { warehouseId, currency } = useBranch();
  const isMain = (user?.warehouse as { isMain?: boolean } | null | undefined)?.isMain !== false;

  const [form, setForm] = useState<ProductFormData | null>(() => (creating ? newProductForm(newId) : null));
  const [error, setError] = useState<unknown>(null);
  const [printers, setPrinters] = useState<PrinterRef[]>([]);
  const [categoryPrinter, setCategoryPrinter] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionForm[] | null>(null);
  const [problem, setProblem] = useState<ProductProblem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('product', id, async () => (await api.call<{ result: Detail }>('GET', `/api/product-v2/${encodeURIComponent(id)}`)).result);
      setForm(formFromDetail(r.data));
    } catch (e) {
      setError(e);
    }
  }, [data, api, id]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!creating) void load();
  }, [creating, load]);

  useEffect(() => {
    data.cachedRead('printers-ref', warehouseId, async () => (await api.call<{ result?: PrinterRef[] }>('GET', '/api/printer')).result ?? []).then((r) => setPrinters(r.data), () => undefined);
  }, [data, api, warehouseId]);

  if (!isMain) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.products')} />
        <Text style={styles.message}>{t('pform.mainOnly')}</Text>
      </SafeAreaView>
    );
  }

  if (!form) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.products')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const movie = isMovie(form);
  const change = (f: ProductFormData) => setForm(f);

  function chooseCategory(c: { id: string; printerId?: string | null } | null) {
    const f = form!;
    const next = setCategory(f, c?.id ?? '', c?.printerId ?? null);
    setCategoryPrinter(c?.printerId ?? null);
    const movieNow = isMovie(next);
    setForm(movieNow && !next.movie ? { ...next, movie: defaultMovie(next, dayText(new Date())) } : next);
  }

  function openOptions() {
    const f = form!;
    // only the values of options that the current variants still use are shown, as on the web
    const names = f.variants.map((v) => v.name);
    setOptions(f.options.map((o) => ({ ...o, values: o.values.filter((v) => names.includes(v.value)).map((v) => ({ ...v })) })));
  }

  function save() {
    const f = form!;
    const bad = validateProduct(f);
    setProblem(bad);
    if (bad) {
      Alert.alert(t(`pform.problem_${bad.field}`, { n: 'index' in bad ? bad.index + 1 : 0 }));
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        if (f.isNewProduct) await api.call('POST', '/api/product-v2', createBody(f));
        else await api.call('PUT', '/api/product-v2', updateBody(f));
        router.back();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={creating ? t('pform.createTitle') : t('pform.editTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title={t('pform.information')}>
            <Field label={t('pform.title')} value={form.title} onChangeText={(v) => change({ ...form, title: v })} error={problem?.field === 'title' ? t('pform.problem_title', { n: 0 }) : undefined} />
            <SupplierPicker api={api} data={data} value={form.supplierId} onChange={(sid) => change({ ...form, supplierId: sid })} />
            <CategoryPicker api={api} data={data} warehouseId={warehouseId} value={form.categoryId} onChange={chooseCategory} />
            <Field label={t('pform.description')} value={form.description} onChangeText={(v) => change({ ...form, description: v })} multiline />
            <ToggleRow label={t('pform.forSale')} value={form.isForSale} onChange={(v) => change({ ...form, isForSale: v })} />
            <ToggleRow label={t('pform.trackStock')} value={form.trackStock} onChange={(v) => change({ ...form, trackStock: v })} />
          </Section>

          <Section title={t('pform.images')}>
            <ImagesSection api={api} form={form} onChange={change} guard={guard} />
          </Section>

          <Section title={t('pform.variants')}>
            <VariantsSection api={api} form={form} onChange={change} printers={printers} currency={currency} movie={movie} onConfigure={openOptions} />
          </Section>

          {!movie ? (
            <Section title={t('pform.conversions')}>
              <ConversionsSection form={form} onChange={change} />
            </Section>
          ) : null}

          {movie ? (
            <Section title={t('pform.movie')}>
              <MovieSection api={api} movie={form.movie ?? defaultMovie(form, dayText(new Date()))} onChange={(m) => change({ ...form, movie: m })} guard={guard} />
            </Section>
          ) : null}

          {problem && problem.field !== 'title' ? <Text style={styles.error}>{t(`pform.problem_${problem.field}`, { n: 'index' in problem ? problem.index + 1 : 0 })}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.cancel')} variant="outline" onPress={() => router.back()} style={styles.flex} />
          <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
        </View>
      </KeyboardAvoidingView>

      {options ? (
        <OptionsDialog
          start={options}
          existing={!form.isNewProduct}
          onClose={() => setOptions(null)}
          onGenerate={(opts) => {
            change(applyOptions(form, opts, newId, categoryPrinter));
            setOptions(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.md },
  message: { padding: space.lg, fontSize: font.body, color: colors.mutedForeground, textAlign: 'center' },
  error: { fontSize: font.small, color: colors.destructive },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

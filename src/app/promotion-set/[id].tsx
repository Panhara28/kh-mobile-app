import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages, type CategoryRow } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { emptyPromo, newPromoItem, promoBody, promoForm, validatePromo, type MatchType, type PromoForm, type PromoItem, type PromoRow } from '@/lib/promotion-sets';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

const MATCH_TYPES: MatchType[] = ['VARIANT', 'PRODUCT', 'CATEGORY'];

/** Add or edit one promotion set: validity, daily hours, and the items (what to buy, what is discounted). Needs the server to save. */
export default function PromotionSetScreen() {
  const { t } = useTranslation();
  const { id, isNew } = useLocalSearchParams<{ id: string; isNew?: string }>();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();

  const [existing, setExisting] = useState<PromoRow | undefined>();
  const [form, setForm] = useState<PromoForm | null>(isNew ? emptyPromo(id) : null);
  const [error, setError] = useState<unknown>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [addType, setAddType] = useState<MatchType | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNew) {
      data
        .cachedRead('promotion-sets', 'all', () => fetchAllPages<PromoRow>(async (o, l) => (await api.call<{ result: { data: PromoRow[]; total: number } }>('GET', `/api/promotion-set?limit=${l}&offset=${o}`)).result))
        .then(
          (r) => {
            const row = r.data.find((p) => p.id === id);
            if (row) {
              setExisting(row);
              setForm(promoForm(row));
            } else setError(new Error('not found'));
          },
          (e) => setError(e),
        );
    }
    data.cachedRead('categories-ref', 'all', () => fetchAllPages<CategoryRow>(async (o, l) => (await api.call<{ result: { data: CategoryRow[]; total: number } }>('GET', `/api/category?limit=${l}&offset=${o}`)).result)).then((r) => setCategories(r.data), () => undefined);
  }, [data, api, id, isNew]);

  if (!form) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.promotionSets')} />
        {error ? <ErrorState error={error} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const set = <K extends keyof PromoForm>(k: K, v: PromoForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setItem = (i: number, patch: Partial<PromoItem>) => setForm((f) => (f ? { ...f, items: f.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) } : f));
  const canSave = can(user, 'discount', isNew ? 'create' : 'update');
  const canDelete = !isNew && can(user, 'discount', 'delete');

  function save() {
    const f = form!;
    const bad = validatePromo(f);
    setProblem(bad);
    if (bad) return;
    const body = promoBody(f, user?.currentWarehouseId ?? null, existing);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(isNew ? 'POST' : 'PUT', '/api/promotion-set', body);
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
      <ScreenHeader title={isNew ? t('promo.new') : form.title} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Input value={form.title} onChangeText={(v) => set('title', v)} placeholder={t('promo.title')} accessibilityLabel={t('promo.title')} />
            <Input value={form.description} onChangeText={(v) => set('description', v)} placeholder={t('promo.description')} accessibilityLabel={t('promo.description')} multiline />
            <View style={styles.row}>
              <Text style={styles.label}>{t('promo.active')}</Text>
              <Switch value={form.isActive} onValueChange={(v) => set('isActive', v)} />
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('promo.validity')}</Text>
            <View style={styles.row}>
              <Input style={styles.flex} value={form.startAt} onChangeText={(v) => set('startAt', v)} placeholder={`${t('promo.from')} YYYY-MM-DD`} autoCapitalize="none" accessibilityLabel={t('promo.from')} />
              <Input style={styles.flex} value={form.endAt} onChangeText={(v) => set('endAt', v)} placeholder={`${t('promo.to')} YYYY-MM-DD`} autoCapitalize="none" accessibilityLabel={t('promo.to')} />
            </View>
            <Text style={styles.section}>{t('promo.happyHour')}</Text>
            <View style={styles.row}>
              <Input style={styles.flex} value={form.dailyStartTime} onChangeText={(v) => set('dailyStartTime', v)} placeholder={`${t('promo.from')} HH:mm`} autoCapitalize="none" accessibilityLabel={t('promo.from')} />
              <Input style={styles.flex} value={form.dailyEndTime} onChangeText={(v) => set('dailyEndTime', v)} placeholder={`${t('promo.to')} HH:mm`} autoCapitalize="none" accessibilityLabel={t('promo.to')} />
            </View>
            <NumberField label={t('promo.maxApply')} value={form.maxApplyPerOrder} onChange={(v) => set('maxApplyPerOrder', v)} />
            <NumberField label={t('promo.priority')} value={form.priority} onChange={(v) => set('priority', v)} />
          </Card>

          <Text style={styles.section}>{t('po.items')}</Text>
          {form.items.map((it, i) => (
            <Card key={it.id ?? `${it.matchId}-${i}`} style={styles.card}>
              <Text style={styles.heading}>
                {t(`promo.match_${it.matchType}`)}: {it.matchTitle ?? it.matchId}
              </Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <NumberField label={t('po.qty')} value={it.qty} onChange={(q) => setItem(i, { qty: q })} />
                </View>
                <View style={styles.flex}>
                  <NumberField label={t('promo.discount')} value={it.discountValue} decimal onChange={(q) => setItem(i, { discountValue: q })} />
                </View>
              </View>
              <View style={styles.chips}>
                <Chip label="%" selected={it.discountType === 'PERCENTAGE'} onPress={() => setItem(i, { discountType: 'PERCENTAGE' })} />
                <Chip label="$" selected={it.discountType === 'AMOUNT'} onPress={() => setItem(i, { discountType: 'AMOUNT' })} />
              </View>
              <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => set('items', form.items.filter((_, k) => k !== i))} />
            </Card>
          ))}
          {problem && !['title'].includes(problem) ? <Text style={styles.error}>{t(`promo.error_${problem}`)}</Text> : null}
          {problem === 'title' ? <Text style={styles.error}>{t('promo.error_title')}</Text> : null}
          <Text style={styles.muted}>{t('promo.addHint')}</Text>
          <View style={styles.chips}>
            {MATCH_TYPES.map((m) => (
              <Chip key={m} label={`+ ${t(`promo.match_${m}`)}`} selected={addType === m} onPress={() => setAddType(m)} />
            ))}
          </View>
          {addType === 'CATEGORY' ? (
            <View style={styles.chips}>
              {categories.map((c) => (
                <Chip key={c.id} label={c.title} selected={false} onPress={() => { set('items', [...form.items, newPromoItem('CATEGORY', c.id, c.title)]); setAddType(null); }} />
              ))}
            </View>
          ) : null}

          {canDelete ? (
            <Button
              title={t('admin.delete')}
              variant="outline"
              onPress={() =>
                Alert.alert(t('promo.deleteConfirm'), undefined, [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('admin.delete'), style: 'destructive', onPress: () => guard(async () => { try { await api.call('DELETE', '/api/promotion-set', { id }); router.back(); } catch (e) { Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined); } }) },
                ])
              }
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {canSave ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.cancel')} variant="outline" onPress={() => router.back()} style={styles.flex} />
          <Button title={t('admin.save')} loading={busy} onPress={save} style={styles.flex} />
        </View>
      ) : null}
      {addType === 'VARIANT' || addType === 'PRODUCT' ? (
        <VariantPicker
          api={api}
          onClose={() => setAddType(null)}
          onPick={(v) => {
            const type = addType;
            const target = type === 'PRODUCT' ? { id: v.productId, title: v.name.replace(/\s*\(.*\)$/, '') } : { id: v.variantId, title: v.name };
            setForm((f) => (f ? { ...f, items: [...f.items, newPromoItem(type, target.id, target.title)] } : f));
            setAddType(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.body, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

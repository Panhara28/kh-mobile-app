import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { SlotRow } from '@/lib/org';
import { componentName, productionBody, shortComponents, suggestedQty, validateProduction, type DraftComponent, type ProductionForm } from '@/lib/production';
import { useSession } from '@/lib/session';
import { pickSetting } from '@/lib/settings';
import { Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

const EMPTY: ProductionForm = { variantId: '', qty: 0, slotId: '', lotNumber: '', expiredAt: '', cost: 0 };

/** Production: make a composed product from its components' stock, into a slot. Needs the server. */
export default function ProductionScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [form, setForm] = useState<ProductionForm>(EMPTY);
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [parts, setParts] = useState<DraftComponent[]>([]);
  const [restrictLots, setRestrictLots] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${l}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), () => undefined);
    data.settings(warehouseId).then(
      ({ data: s }) => {
        try {
          setRestrictLots(!!JSON.parse(pickSetting(s, 'INVENTORY', warehouseId) ?? '{}').restrict_product_lot);
        } catch {
          setRestrictLots(false);
        }
      },
      () => undefined,
    );
  }, [data, api, warehouseId]);

  const set = <K extends keyof ProductionForm>(k: K, v: ProductionForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** What the recipe needs for this quantity, and where it would be taken from. */
  function plan(variantId: string, qty: number) {
    if (!variantId || !(qty >= 1)) {
      setParts([]);
      return;
    }
    guard(async () => {
      setLoading(true);
      try {
        const r = await api.call<{ result?: DraftComponent[] }>('GET', `/api/composition/draft?variantId=${encodeURIComponent(variantId)}&qty=${qty}`);
        setParts(r.result ?? []);
      } catch (e) {
        setParts([]);
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setLoading(false);
      }
    });
  }

  function produce() {
    const bad = validateProduction(form, parts, restrictLots);
    setProblem(bad);
    if (bad) return;
    guard(async () => {
      setBusy(true);
      try {
        await api.call('POST', '/api/composition', productionBody(form, parts));
        Alert.alert(t('production.done'));
        setForm(EMPTY);
        setName('');
        setParts([]);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  const short = shortComponents(parts);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.production')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button title={name || t('production.pickProduct')} variant="outline" onPress={() => setPicking(true)} />
          <Card style={styles.card}>
            <NumberField label={t('production.qty')} value={form.qty} onChange={(q) => set('qty', q)} />
            <Button title={t('production.plan')} variant="outline" loading={loading} onPress={() => plan(form.variantId, form.qty)} />
          </Card>

          {parts.map((c) => (
            <Card key={c.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading}>{componentName(c)}</Text>
                <Text style={[styles.value, { color: c.canProduce ? colors.foreground : colors.destructive }]}>
                  {c.requiredStock} / {c.availableStock}
                </Text>
              </View>
              <Text style={styles.muted}>{t('production.needHave')}</Text>
              {c.stockSlots.map((s, i) => (
                <Text key={i} style={styles.muted}>
                  {s.slot?.name ?? '?'}
                  {s.lot?.lotNumber ? ` · ${s.lot.lotNumber}` : ''}: {s.qty}
                </Text>
              ))}
            </Card>
          ))}
          {short.length > 0 ? <Text style={styles.error}>{t('production.short', { max: suggestedQty(parts, form.qty) })}</Text> : null}

          {parts.length > 0 ? (
            <Card style={styles.card}>
              <Text style={styles.section}>{t('production.intoSlot')}</Text>
              <View style={styles.chips}>
                {slots.map((s) => (
                  <Chip key={s.id} label={s.name} selected={form.slotId === s.id} onPress={() => set('slotId', s.id)} />
                ))}
              </View>
              <Input value={form.lotNumber} onChangeText={(v) => set('lotNumber', v)} placeholder={t('po.lot')} accessibilityLabel={t('po.lot')} />
              <Input value={form.expiredAt} onChangeText={(v) => set('expiredAt', v)} placeholder={`${t('po.expires')} (YYYY-MM-DD)`} autoCapitalize="none" accessibilityLabel={t('po.expires')} />
              <NumberField label={t('po.cost')} value={form.cost} decimal onChange={(c) => set('cost', c)} />
            </Card>
          ) : null}

          {problem ? <Text style={styles.error}>{t(`production.error_${problem}`)}</Text> : null}
          {parts.length > 0 ? <Button title={t('production.make')} loading={busy} onPress={produce} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {picking ? (
        <VariantPicker
          api={api}
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setPicking(false);
            setName(v.name);
            setForm((f) => ({ ...f, variantId: v.variantId, cost: v.price }));
            plan(v.variantId, form.qty);
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
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
});

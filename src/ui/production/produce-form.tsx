import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/catalog';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { SlotRow } from '@/lib/org';
import {
  componentImage,
  componentTitle,
  draftQuery,
  emptyProduction,
  exceedsStock,
  isStockSufficient,
  missingLots,
  produceBlocker,
  produceBlockerOffline,
  productionBody,
  slotLine,
  suggestedQty,
  unitRequired,
  type CompositeOption,
  type DraftComponent,
  type ProductionForm,
} from '@/lib/production';
import { Badge, Button, Card, Chip, Input } from '../components';
import { colors, font, radius, space } from '../theme';
import { CompositePicker } from './composite-picker';
import { LotDialog } from './lot-dialog';

/**
 * The web's "Add Products" sheet on the Production page: the composed product, the slot it goes into,
 * the quantity; the "Composition Summary" of component stock; and Produce.
 */
export function ProduceForm({
  api,
  warehouseId,
  currency,
  restrictLots,
  onClose,
  onSaved,
}: {
  api: KhPosApi;
  warehouseId: string;
  currency: CurrencyCode;
  restrictLots: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const online = state.online;

  const [form, setForm] = useState<ProductionForm>(emptyProduction());
  const [title, setTitle] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [parts, setParts] = useState<DraftComponent[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${l}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), () => undefined);
  }, [data, api, warehouseId]);

  /** Asks the server what the recipe needs for this quantity (the web does this on picking a product and on leaving the quantity box). */
  async function plan(variantId: string, qty: number) {
    if (!variantId) return;
    if (!online) {
      // offline there is no live plan: kh-pos checks the parts and the stock when the change is sent
      setParts([]);
      return;
    }
    const id = ++run.current;
    setLoading(true);
    try {
      const r = await api.call<{ result?: DraftComponent[] }>('GET', `/api/composition/draft?${draftQuery(variantId, qty)}`);
      if (id === run.current) setParts(r.result ?? []);
    } catch (e) {
      if (id === run.current) Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
    } finally {
      if (id === run.current) setLoading(false);
    }
  }

  function pick(v: CompositeOption) {
    setPicking(false);
    setTitle(v.productTitle);
    setForm((f) => ({ ...f, variantId: v.variantId, cost: Number(v.price) || 0 }));
    if (form.qty > 0) void plan(v.variantId, form.qty);
  }

  function leaveQty() {
    if (form.qty > 0) void plan(form.variantId, form.qty);
  }

  const blocker = online ? produceBlocker(form, parts, busy || loading) : produceBlockerOffline(form, busy);

  async function save() {
    setBusy(true);
    try {
      if (online) {
        // written to the phone first; it uses up parts and makes stock, so it is sent only once
        await writer({ entity: 'production', op: 'action', recordId: `${form.variantId}:${Date.now()}`, method: 'POST', path: '/api/composition', body: productionBody(form, parts), once: true, label: title || t('more.production') });
        setScanning(false);
        Alert.alert(t('production.done'));
      } else {
        // kept on the phone and sent later; it uses up parts and makes stock, so it is sent only once
        await writer({ entity: 'production', op: 'action', recordId: form.variantId, method: 'POST', path: '/api/composition', produce: { variantId: form.variantId, qty: form.qty, slotId: form.slotId, cost: form.cost }, label: `${t('production.addProducts')}: ${title}`, once: true });
        Alert.alert(t('offline.savedOffline'));
      }
      onSaved();
    } catch (e) {
      Alert.alert(t('production.saveFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  function produce() {
    if (!online && restrictLots) {
      Alert.alert(t('production.offlineLots'));
      return;
    }
    if (restrictLots) {
      if (missingLots(parts)) {
        Alert.alert(t('production.lotsMissing'));
        return;
      }
      setScanning(true);
      return;
    }
    void save();
  }

  const max = suggestedQty(parts, form.qty);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{t('production.addProducts')}</Text>
            <Card style={styles.card}>
              <Text style={styles.label}>{t('production.product')}</Text>
              <Button title={title || t('production.pickProduct')} variant="outline" onPress={() => setPicking(true)} />
              <Text style={styles.label}>{t('production.slot')}</Text>
              <View style={styles.chips}>
                {slots.map((s) => (
                  <Chip key={s.id} label={s.name} selected={form.slotId === s.id} onPress={() => setForm((f) => ({ ...f, slotId: s.id }))} />
                ))}
              </View>
              <Text style={styles.label}>{t('production.quantity')}</Text>
              <Input
                value={qtyText}
                onChangeText={(v) => {
                  setQtyText(v);
                  const q = parseInt(v, 10);
                  setForm((f) => ({ ...f, qty: Number.isNaN(q) ? 1 : q }));
                }}
                onBlur={leaveQty}
                onSubmitEditing={leaveQty}
                keyboardType="number-pad"
                placeholder="0"
                selectTextOnFocus
                accessibilityLabel={t('production.quantity')}
              />
            </Card>

            {!online ? <Text style={styles.empty}>{t('production.offlineNote')}</Text> : null}
            <View style={styles.row}>
              <Text style={styles.section}>{t('production.summary')}</Text>
              <Badge tone="outline" text={t('production.items', { count: parts.length })} />
            </View>

            {loading ? (
              <Text style={styles.empty}>{t('production.processing')}</Text>
            ) : parts.length === 0 ? (
              <Card style={styles.card}>
                <Text style={styles.empty}>{t('production.noneYet')}</Text>
                <Text style={styles.empty}>{t('production.startHint')}</Text>
              </Card>
            ) : (
              parts.map((c, i) => {
                const ok = isStockSufficient(c);
                const img = componentImage(c);
                return (
                  <Card key={c.id} style={{ ...styles.card, borderWidth: 1, borderColor: ok ? colors.border : colors.destructive }}>
                    <View style={styles.row}>
                      <Text style={styles.muted}>#{i + 1}</Text>
                      <Badge tone={ok ? 'outline' : 'destructive'} text={ok ? t('production.available') : t('production.lowStock')} />
                    </View>
                    <View style={styles.row}>
                      {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="cover" /> : <View style={[styles.img, styles.noimg]} />}
                      <View style={styles.flex}>
                        <Text style={styles.heading} numberOfLines={2}>{componentTitle(c)}</Text>
                        <Text style={styles.muted} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.muted}>
                          {formatMoney(c.price ?? 0, currency)} · SKU: {c.sku || 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.right}>
                        <Text style={styles.heading}>{t('production.needed', { count: c.requiredStock })}</Text>
                        <Text style={styles.muted}>
                          {unitRequired(c, form.qty)} × {form.qty}
                        </Text>
                        <Text style={styles.muted}>{t('production.availableCount', { count: c.availableStock })}</Text>
                      </View>
                    </View>
                    {c.stockSlots.length > 0 ? (
                      <View style={styles.chips}>
                        {c.stockSlots.map((s, k) => {
                          const line = slotLine(s, restrictLots);
                          return (
                            <View key={k} style={[styles.slot, line.missingLot && styles.slotBad]}>
                              <Text style={styles.small}>{line.name}</Text>
                              <Text style={[styles.small, line.missingLot ? styles.bad : styles.muted]}>LOT: {line.lot}</Text>
                              <Badge tone="outline" text={String(s.qty)} />
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}

            {!loading ? (
              <Card style={{ ...styles.card, backgroundColor: colors.muted }}>
                <View style={styles.row}>
                  <Text style={styles.body}>{t('production.productionQty')}</Text>
                  <Text style={[styles.heading, exceedsStock(parts, form.qty) && styles.bad]}>{t('production.qtyCount', { count: form.qty })}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.body}>{t('production.maxPossible')}</Text>
                  <Text style={[styles.heading, { color: colors.info }]}>{t('production.qtyCount', { count: max })}</Text>
                </View>
                {exceedsStock(parts, form.qty) ? <Text style={styles.bad}>⚠️ {t('production.exceeds')}</Text> : null}
              </Card>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={onClose} style={styles.flex} />
            <Button title={t('production.produce')} disabled={!!blocker} loading={busy} onPress={produce} style={styles.flex} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {picking ? <CompositePicker api={api} warehouseId={warehouseId} onClose={() => setPicking(false)} onPick={pick} /> : null}
      {scanning ? <LotDialog parts={parts} busy={busy} onCancel={() => setScanning(false)} onConfirm={() => void save()} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  right: { alignItems: 'flex-end' },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  small: { fontSize: 11, color: colors.foreground },
  bad: { fontSize: font.small, color: colors.destructive, fontWeight: '600' },
  empty: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  img: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.muted, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4 },
  slotBad: { borderWidth: 1, borderColor: colors.destructive },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { useOffline } from '@/lib/offline/provider';
import { waitingCount } from '@/lib/offline/records';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { SlotRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { countBody, countDifference, lotLabel, moveBody, stockInBody, stockOutBody, STOCK_MODES, totalStock, type StockDetail, type StockInForm, type StockMode } from '@/lib/stock-ops';
import { Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { StaleBanner } from '@/ui/sync-status';
import { ErrorState } from '@/ui/states';
import { VariantPicker, type PickedVariant } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

const EMPTY_IN: StockInForm = { qty: 0, lotNumber: '', expiredAt: '', cost: 0 };

/** Count a slot, stock in, stock out, or move stock between slots for one product variant. Needs the server. */
export default function StockCountingScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const waiting = waitingCount(state.commands, ['stock']);
  const warehouseId = user?.currentWarehouseId ?? '';

  // opened from a product's variant menu with the variant (and the job) already chosen
  const params = useLocalSearchParams<{ variantId?: string; productId?: string; name?: string; mode?: string }>();
  const [mode, setMode] = useState<StockMode>(() => (STOCK_MODES as string[]).includes(params.mode ?? '') ? (params.mode as StockMode) : 'count');
  const [variant, setVariant] = useState<PickedVariant | null>(() => (params.variantId ? { variantId: params.variantId, productId: params.productId ?? '', name: params.name ?? '', price: 0, cost: 0, barcode: '' } : null));
  const [picking, setPicking] = useState(false);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [slotId, setSlotId] = useState('');
  const [toSlotId, setToSlotId] = useState('');
  const [detail, setDetail] = useState<StockDetail | null>(null);
  /** The lots on screen come from the copy saved on this phone (kh-pos can't be reached). */
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [lotId, setLotId] = useState('');
  const [qty, setQty] = useState(0);
  const [form, setForm] = useState<StockInForm>(EMPTY_IN);

  useEffect(() => {
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${l}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), (e) => setError(e));
  }, [data, api, warehouseId]);

  const loadDetail = useCallback(async () => {
    if (!variant || !slotId) return;
    try {
      const r = await data.cachedRead('stock-detail', `${variant.variantId}:${slotId}`, async () => (await api.call<{ result: StockDetail }>('GET', `/api/inventory/get-stock-detail-for-counting?variant_id=${encodeURIComponent(variant.variantId)}&slot_id=${encodeURIComponent(slotId)}`)).result);
      setDetail(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setDetail(null);
      setError(e);
    }
  }, [api, data, variant, slotId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail();
  }, [loadDetail]);

  const lots = variant && slotId ? (detail?.stockLot ?? []) : [];
  const available = lotId ? (lots.find((l) => l.lot?.id === lotId)?.stock ?? 0) : totalStock(lots);

  function reset(keepDetail = false) {
    if (!keepDetail) setDetail(null);
    setCounted({});
    setLotId('');
    setQty(0);
    setForm(EMPTY_IN);
    setToSlotId('');
  }

  function submit() {
    if (!variant) return;
    let path = '';
    let body: object | null = null;
    if (mode === 'count') {
      path = '/api/inventory/count-stock';
      body = countBody(variant.variantId, slotId, lots, counted);
    } else if (mode === 'in') {
      path = '/api/inventory/stock-in';
      body = stockInBody(variant.variantId, slotId, form);
    } else if (mode === 'out') {
      path = '/api/inventory/stock-out';
      body = stockOutBody(variant.variantId, slotId, qty, available, lotId || undefined);
    } else {
      path = '/api/inventory/transfer';
      body = moveBody(variant.variantId, slotId, toSlotId, qty, available);
    }
    if (!body) {
      Alert.alert(t('stockops.check'));
      return;
    }
    const send = body;
    // kept on the phone and sent later when kh-pos can't be reached; kh-pos checks the stock when it receives it
    void (async () => {
      setBusy(true);
      try {
        const how = await writer({ entity: 'stock', op: 'action', recordId: `${variant.variantId}:${slotId}`, method: 'POST', path, body: send, label: `${t(`stockops.mode_${mode}`)}: ${variant.name}`, once: true });
        reset(true);
        if (how === 'done') await loadDetail();
        Alert.alert(t(how === 'queued' ? 'stockops.savedOffline' : 'stockops.done'));
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.stockCounting')} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {waiting > 0 ? <Text style={styles.waiting}>{t('offline.waitingNote', { count: waiting })}</Text> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.chips}>
            {STOCK_MODES.map((m) => (
              <Chip key={m} label={t(`stockops.mode_${m}`)} selected={mode === m} onPress={() => { setMode(m); reset(true); }} />
            ))}
          </View>

          <Button title={variant ? variant.name : t('stockops.pickProduct')} variant="outline" onPress={() => setPicking(true)} />

          {variant ? (
            <Card style={styles.card}>
              <Text style={styles.section}>{mode === 'move' ? t('stockops.fromSlot') : t('stockops.slot')}</Text>
              <View style={styles.chips}>
                {slots.map((s) => (
                  <Chip key={s.id} label={s.name} selected={slotId === s.id} onPress={() => { setSlotId(s.id); reset(); }} />
                ))}
              </View>
            </Card>
          ) : null}

          {error ? <ErrorState error={error} onRetry={() => void loadDetail()} /> : null}

          {variant && slotId && detail ? (
            <>
              <Card style={styles.card}>
                <Text style={styles.section}>{t('stockops.inSlot', { count: totalStock(lots) })}</Text>
                {lots.length === 0 ? <Text style={styles.muted}>{t('stockops.noStock')}</Text> : null}
                {lots.map((l, i) => {
                  const id = l.lot?.id ?? `none${i}`;
                  const diff = countDifference(l, counted[id]);
                  return (
                    <View key={id} style={styles.lot}>
                      <View style={styles.row}>
                        <Text style={styles.label}>{lotLabel(l.lot) || t('stockops.noLot')}</Text>
                        <Text style={styles.value}>{l.stock}</Text>
                      </View>
                      {mode === 'count' && l.lot ? (
                        <>
                          <NumberField label={t('stockops.counted')} value={counted[id] ?? l.stock} onChange={(q) => setCounted((c) => ({ ...c, [id]: q }))} />
                          {diff !== 0 ? <Text style={[styles.muted, { color: diff < 0 ? colors.destructive : colors.primary }]}>{t('stockops.difference', { diff: diff > 0 ? `+${diff}` : String(diff) })}</Text> : null}
                        </>
                      ) : null}
                      {mode === 'out' && l.lot ? <Chip label={t('stockops.useLot')} selected={lotId === l.lot.id} onPress={() => setLotId(lotId === l.lot!.id ? '' : l.lot!.id)} /> : null}
                    </View>
                  );
                })}
              </Card>

              {mode === 'in' ? (
                <Card style={styles.card}>
                  <NumberField label={t('po.qty')} value={form.qty} onChange={(q) => setForm((f) => ({ ...f, qty: q }))} />
                  <NumberField label={t('po.cost')} value={form.cost} decimal onChange={(c) => setForm((f) => ({ ...f, cost: c }))} />
                  <Input value={form.lotNumber} onChangeText={(v) => setForm((f) => ({ ...f, lotNumber: v }))} placeholder={t('po.lot')} accessibilityLabel={t('po.lot')} />
                  <Input value={form.expiredAt} onChangeText={(v) => setForm((f) => ({ ...f, expiredAt: v }))} placeholder={`${t('po.expires')} (YYYY-MM-DD)`} autoCapitalize="none" accessibilityLabel={t('po.expires')} />
                </Card>
              ) : null}

              {mode === 'out' || mode === 'move' ? (
                <Card style={styles.card}>
                  <NumberField label={t('po.qty')} value={qty} onChange={setQty} />
                  <Text style={styles.muted}>{t('stockops.available', { count: available })}</Text>
                  {mode === 'move' ? (
                    <>
                      <Text style={styles.section}>{t('stockops.toSlot')}</Text>
                      <View style={styles.chips}>
                        {slots
                          .filter((s) => s.id !== slotId)
                          .map((s) => (
                            <Chip key={s.id} label={s.name} selected={toSlotId === s.id} onPress={() => setToSlotId(s.id)} />
                          ))}
                      </View>
                    </>
                  ) : null}
                </Card>
              ) : null}

              <Button title={t(`stockops.do_${mode}`)} loading={busy} onPress={submit} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {picking ? (
        <VariantPicker
          api={api}
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setVariant(v);
            setPicking(false);
            reset();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  waiting: { fontSize: font.small, color: colors.warning, paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: colors.warningBg },
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lot: { gap: space.xs },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  label: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
});

import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { SlotRow } from '@/lib/org';
import { createPoBody, poTotals, receiveBody, remaining, statusBody, statusTone, validatePo, type PoDetail, type PoExtra, type PoLine, type ReceivePick } from '@/lib/purchase';
import { useSession } from '@/lib/session';
import { toKhPosTime } from '@/lib/time';
import { Badge, Button, Card, Chip, Field } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

interface SupplierRef {
  id: string;
  name: string;
}

/**
 * A purchase order: make a new one (supplier, items with quantity and cost, extra costs), or open
 * one to approve it, receive stock into a slot, or delete a draft. Needs the server.
 */
export default function PurchaseOrderScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === 'new';
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // new order
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [expected, setExpected] = useState('');
  const [lines, setLines] = useState<PoLine[]>([]);
  const [extras, setExtras] = useState<PoExtra[]>([]);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // receiving
  const [receiving, setReceiving] = useState(false);
  const [picks, setPicks] = useState<Record<string, ReceivePick>>({});

  const load = useCallback(async () => {
    try {
      if (creating) {
        setSuppliers((await data.cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRef>(async (o, l) => (await api.call<{ result: { data: SupplierRef[]; total: number } }>('GET', `/api/supplier?limit=${l}&offset=${o}`)).result))).data);
      } else {
        const r = await data.cachedRead('po', id, async () => (await api.call<{ result: PoDetail }>('GET', `/api/purchase-order/detail/${encodeURIComponent(id)}`)).result);
        setDetail(r.data);
      }
      setError(null);
    } catch (e) {
      setError(e);
    }
    data.cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${l}&offset=${o}`)).result)).then((r) => setSlots(r.data), () => undefined);
  }, [data, api, id, creating, warehouseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function act(action: () => Promise<unknown>, after?: () => void) {
    guard(async () => {
      setBusy(true);
      try {
        await action();
        after?.();
        await load();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function create() {
    const bad = validatePo({ supplierId, lines });
    if (bad) {
      setProblem(bad);
      return;
    }
    const body = createPoBody({ supplierId, warehouseId, purchasedAt: toKhPosTime(new Date()), expectedAt: expected.trim() ? `${expected.trim()} 00:00:00` : null, note, lines, extras }, () => Crypto.randomUUID());
    void act(() => api.call('POST', '/api/purchase-order', body), () => router.back());
  }

  if (!creating && !detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.purchaseOrders')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  // ---- a new order ----
  if (creating) {
    const totals = poTotals(lines, extras);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title={t('po.new')} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.card}>
              <Text style={styles.section}>{t('po.supplier')}</Text>
              <View style={styles.chips}>
                {suppliers.map((s) => (
                  <Chip key={s.id} label={s.name} selected={supplierId === s.id} onPress={() => setSupplierId(s.id)} />
                ))}
              </View>
              {problem === 'supplier' ? <Text style={styles.error}>{t('po.error_supplier')}</Text> : null}
              <Field label={t('po.expected')} value={expected} onChangeText={setExpected} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              <Field label={t('suppliers.note')} value={note} onChangeText={setNote} multiline />
            </Card>

            <Text style={styles.section}>{t('po.items')}</Text>
            {lines.map((l, i) => (
              <Card key={l.variantId} style={styles.card}>
                <Text style={styles.heading}>{l.name}</Text>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <NumberField label={t('po.qty')} value={l.qty} onChange={(q) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: q } : x)))} />
                  </View>
                  <View style={styles.flex}>
                    <NumberField label={t('po.cost')} value={l.cost} decimal onChange={(c) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, cost: c } : x)))} />
                  </View>
                </View>
                <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setLines((ls) => ls.filter((_, k) => k !== i))} />
              </Card>
            ))}
            {problem === 'lines' || problem === 'qty' || problem === 'cost' ? <Text style={styles.error}>{t(`po.error_${problem}`)}</Text> : null}
            <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />

            <Text style={styles.section}>{t('po.extraCosts')}</Text>
            {extras.map((e, i) => (
              <Card key={i} style={styles.card}>
                <Field label={t('po.extraName')} value={e.name} onChangeText={(v) => setExtras((xs) => xs.map((x, k) => (k === i ? { ...x, name: v } : x)))} />
                <NumberField label={t('po.cost')} value={e.cost} decimal onChange={(c) => setExtras((xs) => xs.map((x, k) => (k === i ? { ...x, cost: c } : x)))} />
                <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setExtras((xs) => xs.filter((_, k) => k !== i))} />
              </Card>
            ))}
            <Button title={`+ ${t('po.addExtra')}`} variant="outline" onPress={() => setExtras((xs) => [...xs, { name: '', cost: 0 }])} />

            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>{t('po.items')}</Text>
                <Text style={styles.value}>{formatMoney(totals.items, 'USD')}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t('po.extraCosts')}</Text>
                <Text style={styles.value}>{formatMoney(totals.extra, 'USD')}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.heading}>{t('receipt.total')}</Text>
                <Text style={styles.heading}>{formatMoney(totals.total, 'USD')}</Text>
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.cancel')} variant="outline" onPress={() => router.back()} style={styles.flex} />
          <Button title={t('po.saveDraft')} loading={busy} onPress={create} style={styles.flex} />
        </View>
        {picking ? (
          <VariantPicker
            api={api}
            onClose={() => setPicking(false)}
            onPick={(v) => {
              setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls : [...ls, { variantId: v.variantId, name: v.name, qty: 1, cost: v.cost }]));
              setPicking(false);
            }}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  // ---- an existing order ----
  const d = detail!;
  const money = (v: number | string | null | undefined) => formatMoney(v ?? 0, 'USD');
  const canApprove = d.status === 'draft' && can(user, 'purchase-order', 'update');
  const canReceive = d.status === 'approved' && can(user, 'purchase-order', 'update');
  const canDelete = d.status === 'draft' && can(user, 'purchase-order', 'delete');
  const receivable = d.items.filter((i) => remaining(i) > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={`${t('more.purchaseOrders')} #${d.poIncrement ?? ''}`} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>{d.supplier?.name ?? ''}</Text>
            <Badge tone={statusTone(d.status)} text={t(`po.status_${d.status}`, { defaultValue: d.status })} />
          </View>
          <Text style={styles.muted}>{[d.purchasedAt?.slice(0, 10), d.expectedAt ? `${t('po.expected')} ${d.expectedAt.slice(0, 10)}` : null].filter(Boolean).join(' · ')}</Text>
          {d.note ? <Text style={styles.muted}>{d.note}</Text> : null}
        </Card>

        {d.items.map((i) => (
          <Card key={i.id} style={styles.card}>
            <Text style={styles.heading}>{i.name}</Text>
            <View style={styles.row}>
              <Text style={styles.muted}>
                {i.qty} × {money(i.purchaseCost)}
              </Text>
              <Text style={styles.value}>{money(i.amount)}</Text>
            </View>
            <Text style={styles.muted}>{t('po.received', { got: i.receivedQty ?? 0, of: i.qty ?? 0 })}</Text>
            {receiving && remaining(i) > 0 ? (
              <View style={styles.receive}>
                <NumberField label={t('po.receiveQty')} value={picks[i.id]?.qty ?? remaining(i)} onChange={(q) => setPicks((p) => ({ ...p, [i.id]: { slotId: p[i.id]?.slotId ?? slots[0]?.id ?? '', ...p[i.id], qty: q } }))} />
                <View style={styles.chips}>
                  {slots.map((s) => (
                    <Chip key={s.id} label={s.name} selected={(picks[i.id]?.slotId ?? slots[0]?.id) === s.id} onPress={() => setPicks((p) => ({ ...p, [i.id]: { qty: p[i.id]?.qty ?? remaining(i), ...p[i.id], slotId: s.id } }))} />
                  ))}
                </View>
                <Field label={t('po.lot')} value={picks[i.id]?.lotNumber ?? ''} onChangeText={(v) => setPicks((p) => ({ ...p, [i.id]: { qty: p[i.id]?.qty ?? remaining(i), slotId: p[i.id]?.slotId ?? slots[0]?.id ?? '', ...p[i.id], lotNumber: v } }))} />
                <Field label={t('po.expires')} value={picks[i.id]?.expiredAt ?? ''} onChangeText={(v) => setPicks((p) => ({ ...p, [i.id]: { qty: p[i.id]?.qty ?? remaining(i), slotId: p[i.id]?.slotId ?? slots[0]?.id ?? '', ...p[i.id], expiredAt: v } }))} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
            ) : null}
          </Card>
        ))}

        {d.additionalCosts.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.section}>{t('po.extraCosts')}</Text>
            {d.additionalCosts.map((c) => (
              <View key={c.id} style={styles.row}>
                <Text style={styles.label}>{c.name}</Text>
                <Text style={styles.value}>{money(c.cost)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>{t('receipt.total')}</Text>
            <Text style={styles.heading}>{money(d.total)}</Text>
          </View>
        </Card>

        {canApprove ? <Button title={t('po.approve')} loading={busy} onPress={() => void act(() => api.call('PUT', '/api/purchase-order', statusBody(d, 'approved')))} /> : null}
        {canReceive && receivable.length > 0 && !receiving ? <Button title={t('po.receive')} onPress={() => setReceiving(true)} /> : null}
        {receiving ? (
          <Button
            title={t('po.confirmReceive')}
            loading={busy}
            onPress={() => {
              const full: Record<string, ReceivePick> = {};
              for (const i of receivable) full[i.id] = { qty: remaining(i), slotId: slots[0]?.id ?? '', ...picks[i.id] };
              const body = receiveBody(d.id, d.items, full);
              if (!body) {
                Alert.alert(t('po.nothingToReceive'));
                return;
              }
              void act(() => api.call('POST', '/api/purchase-order/receive', body), () => {
                setReceiving(false);
                setPicks({});
              });
            }}
          />
        ) : null}
        {canDelete ? (
          <Button
            title={t('admin.delete')}
            variant="outline"
            onPress={() =>
              Alert.alert(t('po.deleteConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('admin.delete'), style: 'destructive', onPress: () => void act(() => api.call('DELETE', '/api/purchase-order', { id: d.id }), () => router.back()) },
              ])
            }
          />
        ) : null}
      </ScrollView>
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
  label: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  receive: { gap: space.sm, marginTop: space.xs },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

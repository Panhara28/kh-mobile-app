import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { CompositeOption } from '@/lib/production';
import { addExtra, addProduct, formTotals, removeExtra, removeItem, saveBody, setExtra, setItem, validateForm, visibleExtras, visibleItems, type PoForm } from '@/lib/purchase';
import { Button, Card, Chip, Field } from '../components';
import { CompositePicker } from '../production/composite-picker';
import { ScreenHeader } from '../screen-header';
import { colors, font, radius, space } from '../theme';

interface SupplierRef {
  id: string;
  name: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Create / Edit Purchase Order" like the web sheet: supplier, order date, expected date, note, the
 * items (in stock, quantity, purchase cost, amount) found with the product search, and additional costs.
 * A new order is saved as a draft; editing keeps its status.
 */
export function PoFormScreen({ api, warehouseId, initial, onSaved, onCancel }: { api: KhPosApi; warehouseId: string; initial: PoForm; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { data } = useOffline();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<PoForm>(initial);
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const editing = !!form.id;

  useEffect(() => {
    data
      .cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRef>(async (o, l) => (await api.call<{ result: { data: SupplierRef[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result))
      .then((r) => setSuppliers(r.data), () => undefined);
  }, [data, api]);

  const items = visibleItems(form);
  const extras = visibleExtras(form);
  const totals = formTotals(form);

  function pick(v: CompositeOption) {
    setPicking(false);
    const r = addProduct(form, { variantId: v.variantId, name: v.productTitle, sku: v.sku, stock: v.stock, purchasedCost: v.purchasedCost }, () => Crypto.randomUUID());
    if (r.duplicate) Alert.alert(t('po.skuExists'));
    else setForm(r.form);
  }

  function save() {
    const bad = validateForm(form);
    if (bad) {
      Alert.alert(bad.kind === 'supplier' ? t('po.error_supplier') : bad.kind === 'items' ? t('po.error_lines') : bad.kind === 'qty' ? t('po.error_qtyFor', { name: bad.name }) : t('po.error_extraFor', { name: bad.name }));
      return;
    }
    if ((form.purchasedAt && !DATE.test(form.purchasedAt)) || (form.expectedAt && !DATE.test(form.expectedAt))) {
      Alert.alert(t('po.error_date'));
      return;
    }
    // kept on the phone and sent later when kh-pos can't be reached. kh-pos makes the id of a new order, so a new
    // order is sent only once and can't be opened or edited until it has been sent.
    const body = saveBody(form, warehouseId);
    const localId = Crypto.randomUUID();
    const supplier = suppliers.find((s) => s.id === form.supplierId);
    void (async () => {
      setBusy(true);
      try {
        const how = await writer(
          editing
            ? { entity: 'purchase-order', op: 'update', recordId: form.id, method: 'PUT', path: '/api/purchase-order', body, label: `${t('po.editTitle')}: ${supplier?.name ?? ''}`.trim() }
            : {
                entity: 'purchase-order',
                op: 'create',
                recordId: localId,
                method: 'POST',
                path: '/api/purchase-order',
                body,
                label: `${t('po.createTitle')}: ${supplier?.name ?? ''}`.trim(),
                once: true,
                row: { id: localId, status: 'draft', total: totals.total, totalQty: items.reduce((a, i) => a + (Number(i.qty) || 0), 0), supplier: { name: supplier?.name ?? '' }, purchasedAt: form.purchasedAt, expectedAt: form.expectedAt || null, received: 0, receivedTotal: 0 },
              },
        );
        Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : editing ? 'po.updated' : 'po.created'));
        onSaved();
      } catch (e) {
        Alert.alert(editing ? t('po.updateFailed') : t('po.createFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={editing ? t('po.editTitle') : t('po.createTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Text style={styles.section}>{t('po.supplier')}</Text>
            <View style={styles.chips}>
              {suppliers.map((s) => (
                <Chip key={s.id} label={s.name} selected={form.supplierId === s.id} onPress={() => setForm({ ...form, supplierId: s.id })} />
              ))}
            </View>
            <Field label={t('po.orderDate')} value={form.purchasedAt} onChangeText={(v) => setForm({ ...form, purchasedAt: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <Field label={t('po.expectedDate')} value={form.expectedAt} onChangeText={(v) => setForm({ ...form, expectedAt: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <Field label={t('po.note')} value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} multiline />
          </Card>

          <Text style={styles.section}>{t('po.items')}</Text>
          {items.map((i) => (
            <Card key={i.id} style={styles.card}>
              <Text style={styles.heading} numberOfLines={2}>{i.name}</Text>
              <Text style={styles.muted}>
                {i.sku != null ? `${i.sku} · ` : ''}
                {t('po.inStock')}: {i.stock}
              </Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Field label={t('po.qty')} value={i.qty ? String(i.qty) : ''} onChangeText={(v) => setForm(setItem(form, i.id, { qty: v ? parseInt(v, 10) || 0 : 0 }))} keyboardType="number-pad" selectTextOnFocus />
                </View>
                <View style={styles.flex}>
                  <Field label={t('po.cost')} value={i.purchaseCost} onChangeText={(v) => setForm(setItem(form, i.id, { purchaseCost: v }))} keyboardType="decimal-pad" selectTextOnFocus />
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t('po.amount')}: {formatMoney(i.amount, 'USD')}</Text>
                <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setForm(removeItem(form, i.id))} />
              </View>
            </Card>
          ))}
          <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />

          {extras.length > 0 ? <Text style={styles.section}>{t('po.extraCosts')}</Text> : null}
          {extras.map((c) => (
            <Card key={c.id} style={styles.card}>
              <Field label={t('po.extraName')} value={c.name} onChangeText={(v) => setForm(setExtra(form, c.id, { name: v }))} />
              <Field label={t('po.amount')} value={c.cost} onChangeText={(v) => setForm(setExtra(form, c.id, { cost: v }))} keyboardType="decimal-pad" selectTextOnFocus />
              <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setForm(removeExtra(form, c.id))} />
            </Card>
          ))}
          <Button title={`+ ${t('po.addExtra')}`} variant="outline" onPress={() => setForm(addExtra(form, () => Crypto.randomUUID()))} />

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
        <Button title={t('common.cancel')} variant="outline" onPress={onCancel} disabled={busy} style={styles.flex} />
        <Button title={editing ? t('po.update') : t('po.create')} loading={busy} onPress={save} style={styles.flex} />
      </View>
      {picking ? <CompositePicker api={api} warehouseId={warehouseId} compositeOnly={false} includeNotForSale onClose={() => setPicking(false)} onPick={pick} /> : null}
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
  label: { fontSize: font.small, color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

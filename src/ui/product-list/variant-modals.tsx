import * as Print from 'expo-print';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages, type SupplierRow } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import type { OfflineData } from '@/lib/offline/data';
import { emptySupplierPrice, labelHtml, supplierPriceCreateBody, supplierPriceForm, supplierPriceUpdateBody, validateSupplierPrice, type SupplierPriceForm, type SupplierPriceRow } from '@/lib/product-list';
import { movementDirection, variantLabel, type MovementRow } from '@/lib/stock-activity';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { ErrorState, LoadingState } from '@/ui/states';
import { NumInput } from '@/ui/product-form/parts';
import { colors, font, radius, space } from '@/ui/theme';

function Shell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <Text style={[styles.title, styles.flex]} numberOfLines={2}>
            {title}
          </Text>
          <Button title={t('common.close')} variant="ghost" size="sm" onPress={onClose} />
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {children}
        </KeyboardAvoidingView>
        {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

/** Every stock movement of one variant in this branch (GET /api/product-v2/variant-transaction). */
export function TransactionsModal({ api, variantId, title, onClose }: { api: KhPosApi; variantId: string; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api
      .getOrSaved<{ result?: MovementRow[] }>(`/api/product-v2/variant-transaction?variant_id=${encodeURIComponent(variantId)}`)
      .then((r) => setRows(r.result ?? []), (e) => setError(e));
  }, [api, variantId]);

  return (
    <Shell title={`${t('plist.transactions')} · ${title}`} onClose={onClose}>
      {rows === null ? (
        error ? <ErrorState error={error} /> : <LoadingState />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>{t('stock.empty')}</Text>}
          renderItem={({ item }) => {
            const out = movementDirection(item.transactionType, item.qty) === 'out';
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Badge tone="outline" text={t(`stock.type_${item.transactionType}`, { defaultValue: item.transactionType ?? '' })} />
                  <Text style={[styles.qty, { color: out ? colors.destructive : colors.success }]}>
                    {out ? '−' : '+'}
                    {Math.abs(item.qty)}
                  </Text>
                </View>
                <Text style={styles.muted}>{[variantLabel(item.variant), item.slot?.name, item.createdBy?.fullname || item.createdBy?.username].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.muted}>{item.createdAt}</Text>
              </Card>
            );
          }}
        />
      )}
    </Shell>
  );
}

/** The prices suppliers charge for a variant: see them, add, change (and schedule a later price) or delete. */
export function SupplierPriceModal({ api, data, variantId, title, currency, canEdit, onClose }: { api: KhPosApi; data: OfflineData; variantId: string; title: string; currency: string; canEdit: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SupplierPriceRow[] | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: SupplierPriceForm } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.getOrSaved<{ result?: { data: SupplierPriceRow[] } }>(`/api/supplier/product-price?productVariantId=${encodeURIComponent(variantId)}&limit=100&offset=0`);
      setRows(r.result?.data ?? []);
    } catch (e) {
      setError(e);
    }
  }, [api, variantId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    data.cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRow>(async (o, l) => (await api.call<{ result: { data: SupplierRow[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setSuppliers(r.data), () => undefined);
  }, [load, data, api]);

  async function save() {
    const e = editing!;
    const bad = validateSupplierPrice(e.form);
    setProblem(bad);
    if (bad) return;
    setBusy(true);
    try {
      if (e.id) await api.call('PUT', '/api/supplier/product-price', supplierPriceUpdateBody(e.id, variantId, e.form));
      else await api.call('POST', '/api/supplier/product-price', supplierPriceCreateBody(variantId, e.form));
      setEditing(null);
      await load();
    } catch (err) {
      Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  function remove(r: SupplierPriceRow) {
    Alert.alert(t('plist.deletePrice'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.call('DELETE', '/api/supplier/product-price', { id: r.id });
            await load();
          } catch (err) {
            Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  const f = editing?.form;
  return (
    <Shell
      title={`${t('plist.supplierPrice')} · ${title}`}
      onClose={onClose}
      footer={canEdit && !editing ? <Button title={`+ ${t('plist.addPrice')}`} onPress={() => { setProblem(null); setEditing({ id: null, form: emptySupplierPrice() }); }} /> : undefined}
    >
      {rows === null ? (
        error ? <ErrorState error={error} /> : <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {editing && f ? (
            <Card style={styles.card}>
              <Text style={styles.label}>{t('pform.supplier')}</Text>
              <View style={styles.chips}>
                {suppliers.map((s) => (
                  <Chip key={s.id} label={s.name} selected={f.supplierId === s.id} onPress={() => setEditing({ ...editing, form: { ...f, supplierId: s.id } })} />
                ))}
              </View>
              <NumInput label={t('plist.price', { currency })} value={f.price} onChange={(n) => setEditing({ ...editing, form: { ...f, price: n ?? 0 } })} />
              {editing.id ? (
                <>
                  <Text style={styles.label}>{t('plist.scheduledAt')}</Text>
                  <Input value={f.scheduledAt} onChangeText={(v) => setEditing({ ...editing, form: { ...f, scheduledAt: v } })} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('plist.scheduledAt')} />
                  <NumInput label={t('plist.scheduledPrice', { currency })} value={f.scheduledPrice} onChange={(n) => setEditing({ ...editing, form: { ...f, scheduledPrice: n ?? 0 } })} />
                </>
              ) : null}
              {problem ? <Text style={styles.error}>{t(`plist.error_${problem}`)}</Text> : null}
              <View style={styles.row}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={() => void save()} style={styles.flex} />
              </View>
            </Card>
          ) : null}
          {rows.length === 0 ? <Text style={styles.muted}>{t('plist.noPrices')}</Text> : null}
          {rows.map((r, i) => (
            <Card key={r.id ?? i} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading}>{r.supplier?.name ?? '?'}</Text>
                <Text style={styles.heading}>{formatMoney(r.price, 'USD')}</Text>
              </View>
              <Text style={styles.muted}>{r.effectDate ? `${t('plist.effective')} ${r.effectDate.slice(0, 10)}` : ''}</Text>
              {r.scheduledAt ? <Text style={styles.muted}>{t('plist.scheduled', { price: formatMoney(r.scheduledPrice ?? 0, 'USD'), date: r.scheduledAt.slice(0, 10) })}</Text> : null}
              {canEdit && r.id ? (
                <View style={styles.row}>
                  <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setProblem(null); setEditing({ id: r.id!, form: supplierPriceForm(r) }); }} />
                  <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(r)} />
                </View>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      )}
    </Shell>
  );
}

/** Print shelf labels for a variant: how many, then the system print dialog (any printer, or save as PDF). */
export function LabelModal({ title, variant, barcode, price, discountedPrice, currency, onClose }: { title: string; variant: string; barcode: string; price: number; discountedPrice?: number | null; currency: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      await Print.printAsync({ html: labelHtml({ title, variant, barcode, price, discountedPrice, currency, copies: copies ?? 1 }) });
    } catch (e) {
      Alert.alert(t('receipt.printFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={`${t('plist.printLabel')} · ${title}`} onClose={onClose} footer={<Button title={t('receipt.print')} loading={busy} onPress={() => void print()} />}>
      <ScrollView contentContainerStyle={styles.list}>
        <NumInput label={t('plist.copies')} value={copies} decimal={false} onChange={setCopies} />
        <Card style={styles.card}>
          <Text style={[styles.heading, styles.center]}>{title}</Text>
          {variant && variant !== 'ns' ? <Text style={[styles.muted, styles.center]}>{variant}</Text> : null}
          <Text style={[styles.title, styles.center]}>
            {discountedPrice != null && discountedPrice < price ? `${formatMoney(discountedPrice, 'USD')}` : formatMoney(price, 'USD')}
          </Text>
          {barcode ? <Text style={[styles.mono, styles.center]}>{barcode}</Text> : <Text style={[styles.muted, styles.center]}>{t('plist.noBarcode')}</Text>}
        </Card>
      </ScrollView>
    </Shell>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  qty: { fontSize: font.title, fontWeight: '700' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: font.body, letterSpacing: 2, color: colors.foreground },
  center: { textAlign: 'center' },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

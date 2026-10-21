import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { BranchRow } from '@/lib/org';
import type { CompositeOption } from '@/lib/production';
import { addRepLine, pickBody, pickingFor, pickRowsFor, removeRepLine, repFormProblem, repFormTotals, repSaveBody, setRepLine, type PickRow, type RepForm } from '@/lib/replenishment';
import { Button, Card, Chip, Field } from '../components';
import { CompositePicker } from '../production/composite-picker';
import { ScreenHeader } from '../screen-header';
import { colors, font, radius, space } from '../theme';

/**
 * "Create / Edit Replenishment" like the web sheet: the source branch is yours (main), pick the
 * destination, add the products (with this branch's stock), set quantity and cost per unit, and
 * "Check Stock" to see which slot and lot each would be taken from. Saving stores the picking list too.
 */
export function RepFormScreen({ api, warehouseId, initial, initialPicking, onSaved, onCancel }: { api: KhPosApi; warehouseId: string; initial: RepForm; initialPicking: PickRow[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<RepForm>(initial);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [picks, setPicks] = useState<PickRow[]>(initialPicking);
  const [checking, setChecking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const editing = !!form.id;

  useEffect(() => {
    data
      .cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse?limit=${Math.min(l, 100)}&offset=${o}`)).result))
      .then((r) => setBranches(r.data), () => undefined);
  }, [data, api]);

  const check = useCallback(
    async (f: RepForm) => {
      if (f.lines.length === 0) {
        setPicks([]);
        return;
      }
      setChecking(true);
      try {
        const r = await api.call<{ result?: PickRow[] }>('GET', `/api/replenishment/${f.id || 'new'}/stock-picking-list?${pickingFor(f.lines)}`);
        setPicks(r.result ?? []);
      } catch (e) {
        Alert.alert(t('rep.checkFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setChecking(false);
      }
    },
    [api, t],
  );

  // an order saved without a picking list gets one when it is opened, like the web
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial.id && initialPicking.length === 0) void check(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = repFormTotals(form);
  const from = branches.find((b) => b.id === form.fromWarehouseId);

  function pick(v: CompositeOption) {
    setPicking(false);
    setForm(addRepLine(form, { variantId: v.variantId, name: v.productTitle, price: v.price, stock: v.stock }));
  }

  function save() {
    const bad = repFormProblem(form);
    if (bad) {
      Alert.alert(bad === 'to' ? t('rep.error_to') : bad === 'same' ? t('rep.error_same') : bad === 'lines' ? t('rep.error_lines') : t('rep.error_qty'));
      return;
    }
    // offline: a new request is kept on the phone and sent later, without a picking list (the web gives a saved order
    // one when it is opened). It makes a new request at kh-pos, so it is sent only once and can't be opened until sent.
    if (!editing && !state.online) {
      const body = repSaveBody(form);
      const localId = Crypto.randomUUID();
      void (async () => {
        setBusy(true);
        try {
          await writer({
            entity: 'replenishment',
            op: 'create',
            recordId: localId,
            method: 'POST',
            path: '/api/replenishment',
            body,
            label: `${t('rep.createTitle')}: ${branches.find((b) => b.id === form.toWarehouseId)?.name ?? ''}`.trim(),
            once: true,
            row: { id: localId, status: 'draft', createdAt: new Date().toISOString(), fromWarehouseId: { id: form.fromWarehouseId, name: from?.name }, toWarehouseId: { id: form.toWarehouseId, name: branches.find((b) => b.id === form.toWarehouseId)?.name }, totalSentQty: totals.qty, totalReceivedQty: 0, totalCost: totals.cost },
          });
          Alert.alert(t('offline.savedOffline'));
          onSaved();
        } catch (e) {
          Alert.alert(t('rep.saveFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        const body = repSaveBody(form);
        if (editing) {
          if (picks.length > 0) await api.call('PUT', `/api/replenishment/${encodeURIComponent(form.id)}/stock-picking-list`, pickBody(picks));
          await api.call('PUT', '/api/replenishment', body);
          Alert.alert(t('rep.updated'));
        } else {
          const r = await api.call<{ result?: string }>('POST', '/api/replenishment', body);
          if (r.result) await api.call('PUT', `/api/replenishment/${encodeURIComponent(r.result)}/stock-picking-list`, pickBody(picks));
          Alert.alert(t('rep.created'));
        }
        onSaved();
      } catch (e) {
        Alert.alert(t('rep.saveFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={editing ? t('rep.editTitle') : t('rep.createTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Text style={styles.section}>{t('rep.source')}</Text>
            <Text style={styles.heading}>{from?.name ?? '—'}</Text>
            <Text style={styles.section}>{t('rep.destination')}</Text>
            <View style={styles.chips}>
              {branches
                .filter((b) => b.id && b.id !== form.fromWarehouseId)
                .map((b) => (
                  <Chip key={b.id} label={b.name} selected={form.toWarehouseId === b.id} onPress={() => setForm({ ...form, toWarehouseId: b.id! })} />
                ))}
            </View>
          </Card>

          <View style={styles.row}>
            <Text style={styles.section}>{t('rep.items')}</Text>
            {form.lines.length > 0 ? <Text style={styles.muted}>{t('rep.itemCount', { count: form.lines.length })}</Text> : null}
          </View>
          {form.lines.length === 0 ? <Text style={styles.muted}>{t('rep.noItems')}</Text> : null}
          {form.lines.map((l) => (
            <Card key={l.variantId} style={styles.card}>
              <Text style={styles.heading} numberOfLines={2}>{l.name}</Text>
              <Text style={styles.muted}>{t('rep.stock')}: {l.stock}</Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Field label={t('po.qty')} value={l.sentQty ? String(l.sentQty) : ''} onChangeText={(v) => setForm(setRepLine(form, l.variantId, { sentQty: v ? parseInt(v, 10) || 0 : 0 }))} keyboardType="number-pad" selectTextOnFocus />
                </View>
                <View style={styles.flex}>
                  <Field label={t('rep.costUnit')} value={String(l.costPerUnit)} onChangeText={(v) => setForm(setRepLine(form, l.variantId, { costPerUnit: Number(v) || 0 }))} keyboardType="decimal-pad" selectTextOnFocus />
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.value}>{t('po.amount')}: ${l.amount.toFixed(2)}</Text>
                <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setForm(removeRepLine(form, l.variantId))} />
              </View>
              {pickRowsFor(picks, l.variantId).map((p, i) => (
                <View key={i} style={styles.pick}>
                  <Text style={styles.small}>SLOT: {p.slot?.name} {p.slot?.posSlot ? '(POS)' : ''}</Text>
                  <Text style={styles.small}>LOT: {p.lot?.lotNumber ?? '—'}</Text>
                  <Text style={styles.small}>{p.slot ? p.qty : '—'}</Text>
                  <Text style={styles.small}>EXP: {p.lot?.expiredDate ?? '—'}</Text>
                  {p.message ? <Text style={styles.error}>{p.message}</Text> : null}
                </View>
              ))}
            </Card>
          ))}
          <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />
          <Button title={t('rep.checkStock')} variant="outline" loading={checking} onPress={() => void check(form)} />
          {checking ? <ActivityIndicator color={colors.primary} /> : null}

          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{t('rep.totalQty')}</Text>
              <Text style={styles.value}>{totals.qty}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.heading}>{t('receipt.total')}</Text>
              <Text style={styles.heading}>{formatMoney(totals.cost, 'USD')}</Text>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title={t('common.cancel')} variant="outline" onPress={onCancel} disabled={busy} style={styles.flex} />
        <Button title={t('customize.save')} loading={busy} disabled={checking} onPress={save} style={styles.flex} />
      </View>
      {picking ? <CompositePicker api={api} warehouseId={warehouseId} compositeOnly={false} forReplenishment onClose={() => setPicking(false)} onPick={pick} /> : null}
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
  pick: { backgroundColor: colors.muted, borderRadius: radius.md, padding: space.sm, gap: 2 },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, color: colors.foreground },
  value: { fontSize: font.small, fontWeight: '700', color: colors.foreground },
  small: { fontSize: 12, color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: 12, color: colors.destructive, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

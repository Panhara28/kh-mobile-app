import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/catalog';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { SlotRow } from '@/lib/org';
import { applyToAll, cancelRemainingBody, categorize, initialReceive, receiveProblem, receiveRequest, remaining, sortForReceive, type PoDetail, type ReceiveMode, type ReceiveRow } from '@/lib/purchase';
import { Badge, Button, Card, Chip, Field } from '../components';
import { ScreenHeader } from '../screen-header';
import { colors, font, radius, space } from '../theme';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Receive Purchase Order" like the web sheet: pick the items that arrived (Full, Partial or Custom
 * mode), set quantity, slot, lot and expiry for each, or one slot and one expiry for all of them, and
 * receive. "Cancel Remaining Items" completes the order without the items that did not come.
 */
export function ReceiveSheet({ api, warehouseId, detail, onClose, onDone }: { api: KhPosApi; warehouseId: string; detail: PoDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const items = detail.items;

  const [mode, setMode] = useState<ReceiveMode>('full');
  const [rows, setRows] = useState<Record<string, ReceiveRow>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [sort, setSort] = useState<'asc' | 'desc' | null>(null);
  const [globalSlot, setGlobalSlot] = useState('');
  const [globalExpiry, setGlobalExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${Math.min(l, 100)}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), () => undefined);
  }, [data, api, warehouseId]);

  // a new mode starts again from the web defaults for it
  useEffect(() => {
    const init = initialReceive(items, mode);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(init.rows);
    setSelected(init.selected);
  }, [items, mode]);

  const cats = useMemo(() => categorize(items), [items]);
  const shown = useMemo(() => sortForReceive(items, sort), [items, sort]);
  const receivable = items.filter((i) => remaining(i) > 0).map((i) => i.id);

  const setRow = (id: string, patch: Partial<ReceiveRow>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function applySlot(slot: SlotRow) {
    setGlobalSlot(slot.id);
    setRows((r) => applyToAll(r, { slotId: slot.id, slotName: slot.name }));
  }

  function applyExpiry() {
    if (globalExpiry && !DATE.test(globalExpiry)) {
      Alert.alert(t('po.error_date'));
      return;
    }
    setRows((r) => applyToAll(r, { expiredAt: globalExpiry || undefined }));
  }

  function submit() {
    const bad = receiveProblem(selected, rows, items);
    if (bad) {
      Alert.alert(bad);
      return;
    }
    if (selected.length === 0) {
      Alert.alert(t('po.selectItems'));
      return;
    }
    if (selected.some((id) => rows[id]?.expiredAt && !DATE.test(rows[id]!.expiredAt!))) {
      Alert.alert(t('po.error_date'));
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        await api.call('POST', '/api/purchase-order/receive', receiveRequest(detail.id, selected, rows));
        Alert.alert(t('po.receivedOk'));
        onDone();
      } catch (e) {
        Alert.alert(t('po.receiveFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function cancelRemaining() {
    Alert.alert(t('po.cancelAllTitle'), `${t('po.cancelAllAsk')}\n${t('po.cancelAllWarn')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('po.cancelRemaining'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            setBusy(true);
            try {
              await api.call('PUT', '/api/purchase-order', cancelRemainingBody(detail));
              Alert.alert(t('po.cancelledOk'));
              onDone();
            } catch (e) {
              Alert.alert(t('po.cancelFailed'), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          }),
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('po.receiveTitle')} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.muted}>{t('po.counts', { pending: cats.pending.length, partial: cats.partial.length, completed: cats.completed.length })}</Text>

          <View style={styles.chips}>
            <Chip label={t('po.mode_full')} selected={mode === 'full'} onPress={() => setMode('full')} />
            <Chip label={t('po.mode_partial')} selected={mode === 'partial'} onPress={() => setMode('partial')} />
            <Chip label={t('po.mode_custom')} selected={mode === 'custom'} onPress={() => setMode('custom')} />
          </View>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('po.bulk')}</Text>
            <Text style={styles.muted}>{t('po.bulkHint')}</Text>
            <View style={styles.chips}>
              {slots.map((s) => (
                <Chip key={s.id} label={s.name} selected={globalSlot === s.id} onPress={() => applySlot(s)} />
              ))}
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Field label={t('po.expires')} value={globalExpiry} onChangeText={setGlobalExpiry} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
              <Button title={t('po.apply')} variant="outline" size="sm" onPress={applyExpiry} />
            </View>
          </Card>

          <View style={styles.row}>
            <Button title={selected.length === receivable.length ? t('po.selectNone') : t('po.selectAll')} variant="outline" size="sm" onPress={() => setSelected(selected.length === receivable.length ? [] : receivable)} />
            <Button title={`${t('po.sortName')} ${sort === 'asc' ? '↑' : sort === 'desc' ? '↓' : ''}`} variant="outline" size="sm" onPress={() => setSort((c) => (c === null ? 'asc' : c === 'asc' ? 'desc' : null))} />
          </View>

          {shown.map((i) => {
            const left = remaining(i);
            const row = rows[i.id];
            const on = selected.includes(i.id);
            return (
              <Card key={i.id} style={{ ...styles.card, ...(left <= 0 ? styles.done : null) }}>
                <View style={styles.row}>
                  <Text style={[styles.heading, styles.flex]} numberOfLines={2}>{i.name}</Text>
                  {left > 0 ? <Chip label={on ? t('po.selected') : t('po.select')} selected={on} onPress={() => toggle(i.id)} /> : <Badge tone="success" text={t('po.complete')} />}
                </View>
                <Text style={styles.muted}>{t('po.received', { got: i.receivedQty ?? 0, of: i.qty ?? 0 })}</Text>
                {left > 0 && row && on ? (
                  <View style={styles.fields}>
                    <Field label={`${t('po.receiveQty')} (≤ ${left})`} value={row.qty ? String(row.qty) : ''} onChangeText={(v) => setRow(i.id, { qty: v ? parseInt(v, 10) || 0 : 0 })} keyboardType="number-pad" selectTextOnFocus />
                    <View style={styles.chips}>
                      {slots.map((s) => (
                        <Chip key={s.id} label={s.name} selected={row.slotId === s.id} onPress={() => setRow(i.id, { slotId: s.id, slotName: s.name })} />
                      ))}
                    </View>
                    <Field label={t('po.lot')} value={row.lotNumber ?? ''} onChangeText={(v) => setRow(i.id, { lotNumber: v || undefined })} />
                    <Field label={t('po.expires')} value={row.expiredAt ?? ''} onChangeText={(v) => setRow(i.id, { expiredAt: v || undefined })} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.row}>
            <Button title={t('common.cancel')} variant="outline" onPress={onClose} disabled={busy} style={styles.flex} />
            {cats.pending.length > 0 ? <Button title={t('po.cancelRemaining')} variant="destructive" disabled={busy} onPress={cancelRemaining} style={styles.flex} /> : null}
          </View>
          <Button title={t('po.receiveN', { count: selected.length })} disabled={selected.length === 0} loading={busy} onPress={submit} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  done: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fields: { gap: space.sm },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  footer: { gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

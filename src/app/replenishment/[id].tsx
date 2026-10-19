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
import type { BranchRow, SlotRow } from '@/lib/org';
import { isVerified, matchLotNumber, pickName, pickProgress, type PickRow, suggestedLines, type SuggestGroup, createRepBody, itemName, receiveBody, remaining, repTone, repTotals, validateRep, type RepDetail, type RepLine, type RepPick } from '@/lib/replenishment';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * One replenishment: send stock from this branch to another (draft, then approve), or receive what
 * another branch sent into a slot here. Needs the server.
 */
export default function ReplenishmentScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === 'new';
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [detail, setDetail] = useState<RepDetail | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<RepLine[]>([]);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [lotText, setLotText] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [picks, setPicks] = useState<Record<string, RepPick>>({});

  const load = useCallback(async () => {
    try {
      if (creating) {
        setBranches((await data.cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse?limit=${l}&offset=${o}`)).result))).data);
      } else {
        const r = await data.cachedRead('replenishment', id, async () => (await api.call<{ result: RepDetail }>('GET', `/api/replenishment/${encodeURIComponent(id)}`)).result);
        setDetail(r.data);
      }
      setError(null);
    } catch (e) {
      setError(e);
    }
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${l}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), () => undefined);
  }, [data, api, id, creating, warehouseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function act(action: () => Promise<unknown>, after?: () => void) {
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

  /** Fills the lines with what the chosen branch is low on (from kh-pos's suggestion). */
  function suggest() {
    if (!toId) {
      setProblem('to');
      return;
    }
    guard(async () => {
      try {
        const r = await api.call<{ result?: SuggestGroup[] }>('GET', `/api/replenishment/suggest?fromWarehouseId=${encodeURIComponent(warehouseId)}`);
        const group = (r.result ?? []).find((g) => g.warehouseId === toId);
        const lines2 = suggestedLines(group?.items ?? []);
        if (lines2.length === 0) Alert.alert(t('rep.noSuggestion'));
        else setLines(lines2);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      }
    });
  }

  function create(status: 'draft' | 'approved') {
    const bad = validateRep({ fromWarehouseId: warehouseId, toWarehouseId: toId, lines });
    if (bad) {
      setProblem(bad);
      return;
    }
    act(() => api.call('POST', '/api/replenishment', createRepBody({ fromWarehouseId: warehouseId, toWarehouseId: toId, lines }, status)), () => router.back());
  }

  if (!creating && !detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.replenishment')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  if (creating) {
    const totals = repTotals(lines);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title={t('rep.new')} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.card}>
              <Text style={styles.section}>{t('rep.sendTo')}</Text>
              <View style={styles.chips}>
                {branches
                  .filter((b) => b.id && b.id !== warehouseId)
                  .map((b) => (
                    <Chip key={b.id} label={b.name} selected={toId === b.id} onPress={() => setToId(b.id!)} />
                  ))}
              </View>
              {problem === 'to' || problem === 'same' ? <Text style={styles.error}>{t('rep.error_to')}</Text> : null}
            </Card>

            <Text style={styles.section}>{t('po.items')}</Text>
            {lines.map((l, i) => (
              <Card key={l.variantId} style={styles.card}>
                <Text style={styles.heading}>{l.name}</Text>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <NumberField label={t('po.qty')} value={l.sentQty} onChange={(q) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, sentQty: q } : x)))} />
                  </View>
                  <View style={styles.flex}>
                    <NumberField label={t('po.cost')} value={l.cost} decimal onChange={(c) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, cost: c } : x)))} />
                  </View>
                </View>
                <Button title={t('products.removeVariant')} variant="ghost" size="sm" onPress={() => setLines((ls) => ls.filter((_, k) => k !== i))} />
              </Card>
            ))}
            {problem === 'lines' || problem === 'qty' ? <Text style={styles.error}>{t(`rep.error_${problem}`)}</Text> : null}
            <Button title={t('rep.suggest')} variant="outline" onPress={suggest} />
            <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />

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
          <Button title={t('po.saveDraft')} variant="outline" loading={busy} onPress={() => create('draft')} style={styles.flex} />
          <Button title={t('rep.sendNow')} loading={busy} onPress={() => create('approved')} style={styles.flex} />
        </View>
        {picking ? (
          <VariantPicker
            api={api}
            onClose={() => setPicking(false)}
            onPick={(v) => {
              setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls : [...ls, { variantId: v.variantId, name: v.name, sentQty: 1, cost: v.cost }]));
              setPicking(false);
            }}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  const d = detail!;
  const info = d.replenishmentInfo;
  const items = d.replenishmentDetails;
  const mine = info.fromWarehouseId?.id === warehouseId;
  const money = (v: number | string | null | undefined) => formatMoney(v ?? 0, 'USD');
  const canApprove = info.status === 'draft' && can(user, 'replenishment', 'update');
  const canDelete = info.status === 'draft' && can(user, 'replenishment', 'delete');
  const canReceive = (info.status === 'approved' || info.status === 'receiving') && !mine && can(user, 'replenishment', 'update');
  const receivable = items.filter((i) => remaining(i) > 0);
  const pickRows = d.replenishmentPickingList ?? [];
  const progress = pickProgress(pickRows);
  const canVerify = mine && (info.status === 'draft' || info.status === 'approved') && can(user, 'replenishment', 'update');

  /** Marks a lot as picked and checked. Typing its lot number does the same as tapping it. */
  function verify(p: PickRow) {
    act(() => api.call('POST', `/api/replenishment/${encodeURIComponent(info.id)}/stock-picking-list`, { lotId: p.lot!.id }));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={`${t('more.replenishment')} #${info.autoId ?? ''}`} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>
              {info.fromWarehouseId?.name ?? '?'} → {info.toWarehouseId?.name ?? '?'}
            </Text>
            <Badge tone={repTone(info.status)} text={t(`rep.status_${info.status}`, { defaultValue: info.status })} />
          </View>
          <Text style={styles.muted}>{info.createdAt?.slice(0, 16)}</Text>
        </Card>

        {items.map((i) => (
          <Card key={i.id} style={styles.card}>
            <Text style={styles.heading}>{itemName(i)}</Text>
            <View style={styles.row}>
              <Text style={styles.muted}>
                {i.sentQty} × {money(i.cost)}
              </Text>
              <Text style={styles.value}>{money(i.sentQty * i.cost)}</Text>
            </View>
            <Text style={styles.muted}>{t('po.received', { got: i.receivedQty, of: i.sentQty })}</Text>
            {receiving && remaining(i) > 0 ? (
              <View style={styles.receive}>
                <NumberField label={t('po.receiveQty')} value={picks[i.id]?.qty ?? remaining(i)} onChange={(q) => setPicks((p) => ({ ...p, [i.id]: { slotId: slots[0]?.id ?? '', ...p[i.id], qty: q } }))} />
                <View style={styles.chips}>
                  {slots.map((s) => (
                    <Chip key={s.id} label={s.name} selected={(picks[i.id]?.slotId ?? slots[0]?.id) === s.id} onPress={() => setPicks((p) => ({ ...p, [i.id]: { qty: remaining(i), ...p[i.id], slotId: s.id } }))} />
                  ))}
                </View>
                <Input value={picks[i.id]?.lotNumber ?? ''} onChangeText={(v) => setPicks((p) => ({ ...p, [i.id]: { qty: remaining(i), slotId: slots[0]?.id ?? '', ...p[i.id], lotNumber: v } }))} placeholder={t('po.lot')} accessibilityLabel={t('po.lot')} />
                <Input value={picks[i.id]?.expiredAt ?? ''} onChangeText={(v) => setPicks((p) => ({ ...p, [i.id]: { qty: remaining(i), slotId: slots[0]?.id ?? '', ...p[i.id], expiredAt: v } }))} placeholder={`${t('po.expires')} (YYYY-MM-DD)`} autoCapitalize="none" accessibilityLabel={t('po.expires')} />
              </View>
            ) : null}
          </Card>
        ))}

        {pickRows.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.section}>{t('rep.picking')}</Text>
              <Text style={styles.muted}>{t('rep.verified', { done: progress.verified, total: progress.total })}</Text>
            </View>
            {pickRows.map((p, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>{`${p.qty} × ${pickName(p)}`}</Text>
                  <Text style={styles.muted}>{[p.slot?.name, p.lot?.lotNumber].filter(Boolean).join(' · ')}</Text>
                </View>
                {isVerified(p) ? <Text style={styles.ok}>✓</Text> : canVerify && p.lot?.id ? <Button title={t('rep.verify')} size="sm" variant="outline" onPress={() => verify(p)} /> : null}
              </View>
            ))}
            {canVerify && progress.total > progress.verified ? (
              <Input value={lotText} onChangeText={setLotText} placeholder={t('rep.lotNumber')} autoCapitalize="none" returnKeyType="done" onSubmitEditing={() => {
                const m = matchLotNumber(pickRows, lotText);
                if (m) {
                  setLotText('');
                  verify(m);
                } else Alert.alert(t('rep.lotNotFound'));
              }} accessibilityLabel={t('rep.lotNumber')} />
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>{t('receipt.total')}</Text>
            <Text style={styles.heading}>{money(info.totalCost)}</Text>
          </View>
        </Card>

        {canApprove ? <Button title={t('po.approve')} loading={busy} onPress={() => act(() => api.call('PUT', `/api/replenishment/${encodeURIComponent(info.id)}/approve`))} /> : null}
        {canReceive && receivable.length > 0 && !receiving ? <Button title={t('po.receive')} onPress={() => setReceiving(true)} /> : null}
        {receiving ? (
          <Button
            title={t('po.confirmReceive')}
            loading={busy}
            onPress={() => {
              const full: Record<string, RepPick> = {};
              for (const i of receivable) full[i.id] = { qty: remaining(i), slotId: slots[0]?.id ?? '', ...picks[i.id] };
              const body = receiveBody(info.id, items, full);
              if (!body) {
                Alert.alert(t('po.nothingToReceive'));
                return;
              }
              act(() => api.call('POST', '/api/replenishment/receive', body), () => {
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
              Alert.alert(t('rep.deleteConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('admin.delete'), style: 'destructive', onPress: () => act(() => api.call('DELETE', '/api/replenishment', { id: info.id }), () => router.back()) },
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
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  receive: { gap: space.sm, marginTop: space.xs },
  ok: { fontSize: font.title, fontWeight: '700', color: colors.success },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

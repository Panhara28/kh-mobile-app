import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { SlotRow } from '@/lib/org';
import { approvalBlockedByLots, emptyRepForm, isVerified, itemName, matchLotNumber, pickName, pickProgress, receiveBody, remaining, repFormFrom, repInfo, repTone, type PickRow, type RepDetail, type RepPick } from '@/lib/replenishment';
import { useSession } from '@/lib/session';
import { pickSetting } from '@/lib/settings';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { RepFormScreen } from '@/ui/replenishment/rep-form';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * One replenishment like the web: "new" and `edit=1` open the form (main branch, drafts); otherwise
 * the details: general information, items with sent / received / remaining, the picking list of the
 * sending branch, Approve (main branch) or Receive (the receiving branch). Needs the server.
 */
export default function ReplenishmentScreen() {
  const { t } = useTranslation();
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const creating = id === 'new';
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const warehouseId = user?.currentWarehouseId ?? '';
  const isMain = !!user?.warehouse?.isMain;

  const [detail, setDetail] = useState<RepDetail | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [restrictLot, setRestrictLot] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [lotText, setLotText] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [picks, setPicks] = useState<Record<string, RepPick>>({});

  const load = useCallback(async () => {
    try {
      if (!creating) {
        const r = await data.cachedRead('replenishment', id, async () => (await api.call<{ result: RepDetail }>('GET', `/api/replenishment/${encodeURIComponent(id)}`)).result);
        setDetail(r.data);
      }
      setError(null);
    } catch (e) {
      setError(e);
    }
    data
      .cachedRead('slots-ref', warehouseId, () => fetchAllPages<SlotRow>(async (o, l) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${Math.min(l, 100)}&offset=${o}`)).result))
      .then((r) => setSlots(r.data), () => undefined);
  }, [data, api, id, creating, warehouseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    data.settings(warehouseId).then(
      ({ data: s }) => {
        try {
          setRestrictLot(!!JSON.parse(pickSetting(s, 'INVENTORY', warehouseId) ?? '{}').restrict_product_lot);
        } catch {
          setRestrictLot(false);
        }
      },
      () => undefined,
    );
  }, [data, warehouseId]);

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

  if (creating) {
    return <RepFormScreen api={api} warehouseId={warehouseId} initial={emptyRepForm(warehouseId)} initialPicking={[]} onSaved={() => router.back()} onCancel={() => router.back()} />;
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.replenishment')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  if (edit === '1') {
    return <RepFormScreen key={detail.replenishmentInfo.id} api={api} warehouseId={warehouseId} initial={repFormFrom(detail)} initialPicking={detail.replenishmentPickingList ?? []} onSaved={() => router.back()} onCancel={() => router.back()} />;
  }

  const d = detail;
  const info = d.replenishmentInfo;
  const items = d.replenishmentDetails;
  const mine = info.fromWarehouseId?.id === warehouseId;
  const money = (v: number | string | null | undefined) => formatMoney(v ?? 0, 'USD');
  const canApprove = info.status === 'draft' && isMain && can(user, 'replenishment', 'update');
  const canReceive = (info.status === 'approved' || info.status === 'receiving') && !isMain && can(user, 'replenishment', 'update');
  const receivable = items.filter((i) => remaining(i) > 0);
  const pickRows = d.replenishmentPickingList ?? [];
  const progress = pickProgress(pickRows);
  const canVerify = mine && info.status === 'draft' && can(user, 'replenishment', 'update');
  const blocked = approvalBlockedByLots(pickRows, restrictLot);

  /** Marks a lot as picked and checked. Typing its lot number does the same as tapping it. */
  function verify(p: PickRow) {
    act(() => api.call('POST', `/api/replenishment/${encodeURIComponent(info.id)}/stock-picking-list`, { lotId: p.lot!.id }));
  }

  function approve() {
    if (blocked) {
      Alert.alert(t('rep.lotRequired'), t('rep.lotRequiredHint'));
      return;
    }
    act(() => api.call('PUT', `/api/replenishment/${encodeURIComponent(info.id)}/approve`), () => Alert.alert(t('rep.approved')));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('rep.detailsTitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.section}>{t('rep.general')}</Text>
            <Badge tone={repTone(info.status)} text={t(`rep.status_${info.status}`, { defaultValue: info.status })} />
          </View>
          {repInfo(info, items.length)
            .filter((x) => x.key !== 'status')
            .map((x) => (
              <View key={x.key} style={styles.row}>
                <Text style={styles.label}>{t(`rep.info_${x.key}`)}</Text>
                <Text style={styles.value}>{x.key === 'totalCost' ? money(x.value) : x.value}</Text>
              </View>
            ))}
        </Card>

        <Text style={styles.section}>{t('rep.itemsTitle')}</Text>
        {items.map((i) => (
          <Card key={i.id} style={styles.card}>
            <Text style={styles.heading}>{itemName(i)}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>{t('rep.sentQty')}</Text>
              <Text style={styles.value}>{i.sentQty}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t('rep.costUnit')}</Text>
              <Text style={styles.value}>{money(i.cost)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t('rep.receivedQty')}</Text>
              <Text style={styles.value}>{i.receivedQty}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t('rep.remainingQty')}</Text>
              <Text style={styles.value}>{i.sentQty - i.receivedQty}</Text>
            </View>
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

        {pickRows.length > 0 && mine ? (
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
                  {p.message ? <Text style={styles.error}>{p.message}</Text> : null}
                </View>
                {isVerified(p) ? <Text style={styles.ok}>✓</Text> : canVerify && p.lot?.id ? <Button title={t('rep.verify')} size="sm" variant="outline" onPress={() => verify(p)} /> : null}
              </View>
            ))}
            {canVerify && progress.total > progress.verified ? (
              <Input
                value={lotText}
                onChangeText={setLotText}
                placeholder={t('rep.lotNumber')}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const m = matchLotNumber(pickRows, lotText);
                  if (m) {
                    setLotText('');
                    verify(m);
                  } else Alert.alert(t('rep.lotNotFound'));
                }}
                accessibilityLabel={t('rep.lotNumber')}
              />
            ) : null}
          </Card>
        ) : null}

        {canApprove ? <Button title={t('po.approve')} loading={busy} onPress={approve} /> : null}
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
              act(
                () => api.call('POST', '/api/replenishment/receive', body),
                () => {
                  setReceiving(false);
                  setPicks({});
                },
              );
            }}
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
  label: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  value: { fontSize: font.small, fontWeight: '700', color: colors.foreground, textAlign: 'right' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  receive: { gap: space.sm, marginTop: space.xs },
  ok: { fontSize: font.title, fontWeight: '700', color: colors.success },
});

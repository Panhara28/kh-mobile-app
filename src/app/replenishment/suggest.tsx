import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { selectableIds, suggestBody, suggestProblem, suggestRows, suggestTotals, toStockIn, type SuggestGroup, type SuggestRow } from '@/lib/replenishment';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Field } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Product Replenishment like the kh-pos web page (the refresh button of Replenishment): for each
 * branch, the products it is low on, with this branch's stock. Pick the ones to send, adjust the
 * quantity, and Create makes a draft replenishment to that branch. Main branch only; needs the server.
 */
export default function ReplenishmentSuggestScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [groups, setGroups] = useState<SuggestGroup[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [current, setCurrent] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [rows, setRows] = useState<Record<string, Record<string, SuggestRow>>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('rep-suggest', warehouseId, async () => (await api.call<{ result?: SuggestGroup[] }>('GET', `/api/replenishment/suggest?fromWarehouseId=${encodeURIComponent(warehouseId)}`)).result ?? []);
      const list = r.data.filter((g) => g.items.length > 0);
      setGroups(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setCurrent((c) => c || list[0]?.warehouseId || '');
      setSelected(Object.fromEntries(list.map((g) => [g.warehouseId, selectableIds(g.items)])));
      setRows(Object.fromEntries(list.map((g) => [g.warehouseId, suggestRows(g.items)])));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, warehouseId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!groups) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('rep.suggestTitle')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const list = groups.filter((g) => g.items.length > 0);
  const group = list.find((g) => g.warehouseId === current);
  const sel = (group && selected[group.warehouseId]) || [];
  const grows = (group && rows[group.warehouseId]) || {};
  const totals = suggestTotals(sel, grows);

  function toggle(id: string) {
    if (!group) return;
    setSelected((s) => ({ ...s, [group.warehouseId]: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] }));
  }

  function create() {
    if (!group) return;
    const bad = suggestProblem(group.items, sel, grows);
    if (bad) {
      Alert.alert(bad.kind === 'min' ? t('rep.sug_min') : t('rep.sug_max'));
      return;
    }
    if (sel.length === 0) {
      Alert.alert(t('rep.error_lines'));
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        await api.call('POST', '/api/replenishment', suggestBody(warehouseId, group.warehouseId, sel, grows));
        Alert.alert(t('rep.created'));
        router.back();
      } catch (e) {
        Alert.alert(t('rep.saveFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('rep.suggestTitle')} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {list.length === 0 ? (
        <EmptyState title={t('rep.noSuggestion')} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.muted}>{t('rep.suggestHelp')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {list.map((g) => (
                <Chip key={g.warehouseId} label={`${g.name} (${g.total})`} selected={current === g.warehouseId} onPress={() => setCurrent(g.warehouseId)} />
              ))}
            </ScrollView>
            {group ? (
              <>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.heading}>{group.name}</Text>
                    <Text style={styles.muted}>{t('rep.needs', { count: group.items.length })}</Text>
                  </View>
                  <Badge tone="info" text={t('rep.selectedCount', { count: sel.length })} />
                </View>
                <Button
                  title={sel.length > 0 ? t('rep.deselectAll', { count: sel.length }) : t('po.selectAll')}
                  variant="outline"
                  size="sm"
                  onPress={() => setSelected((s) => ({ ...s, [group.warehouseId]: sel.length > 0 ? [] : selectableIds(group.items) }))}
                />
                {group.items.map((i) => {
                  const on = sel.includes(i.id);
                  const r = grows[i.id];
                  const empty = Number(i.sourceStock) === 0;
                  const img = i.basicProduct?.images?.find((im) => im.productVariantId === i.id)?.url;
                  return (
                    <Card key={i.id} style={{ ...styles.card, ...(empty ? { backgroundColor: colors.muted } : null) }}>
                      <View style={styles.row}>
                        {img ? <Image source={{ uri: img }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
                        <View style={styles.flex}>
                          <Text style={styles.heading} numberOfLines={2}>
                            {i.basicProduct?.title} ({i.name})
                          </Text>
                          <Text style={styles.muted}>SKU: {i.sku}</Text>
                        </View>
                        <Chip
                          label={on ? t('po.selected') : t('po.select')}
                          selected={on}
                          onPress={() => {
                            if (empty) Alert.alert(t('rep.noStockToSend'));
                            else toggle(i.id);
                          }}
                        />
                      </View>
                      <Line label={t('rep.yourStock')} value={String(i.sourceStock)} />
                      <Line label={t('rep.theirStock', { name: group.name })} value={String(i.stock ?? 0)} />
                      <Line label={t('rep.lowStock')} value={String(i.lowStockQty ?? '')} />
                      <Line label={t('rep.idealStock')} value={String(i.idealStockQty ?? 'N/A')} />
                      <Line label={t('rep.toStockIn')} value={String(toStockIn(i))} />
                      {on && r ? (
                        <View style={styles.row}>
                          <View style={styles.flex}>
                            <Field label={t('rep.qtyToSend')} value={String(r.sentQty)} onChangeText={(v) => setRows((x) => ({ ...x, [group.warehouseId]: { ...grows, [i.id]: { ...r, sentQty: v ? parseInt(v, 10) || 0 : 0 } } }))} keyboardType="number-pad" selectTextOnFocus />
                          </View>
                          <View style={styles.flex}>
                            <Field label={t('rep.costUnit')} value={String(r.costPerUnit)} onChangeText={(v) => setRows((x) => ({ ...x, [group.warehouseId]: { ...grows, [i.id]: { ...r, costPerUnit: Number(v) || 0 } } }))} keyboardType="decimal-pad" selectTextOnFocus />
                          </View>
                        </View>
                      ) : null}
                      {on && r ? <Line label={t('po.amount')} value={formatMoney(Number(r.sentQty) * Number(r.costPerUnit), 'USD')} /> : null}
                    </Card>
                  );
                })}
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.flex}>
              <Text style={styles.muted}>{t('rep.totalQty')}: {totals.qty}</Text>
              <Text style={styles.heading}>{formatMoney(totals.cost, 'USD')}</Text>
            </View>
            <Button title={t('po.create')} loading={busy} disabled={sel.length === 0} onPress={create} style={styles.flex} />
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { gap: 6 },
  img: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  value: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

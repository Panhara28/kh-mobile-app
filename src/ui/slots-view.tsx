import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { isUnsent } from '@/lib/offline/records';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { emptySlot, SLOT_PAGE, slotBody, slotForm, slotQuery, slotTitle, type SlotForm, type SlotRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { dateOnly } from '@/lib/suppliers';
import { Badge, Button, Card, Input } from './components';
import { ToggleRow } from './product-form/parts';
import { ScreenHeader } from './screen-header';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StaleBanner } from './sync-status';
import { colors, font, radius, space } from './theme';

/**
 * Stock slots of one branch like the kh-pos web Slot page: a numbered list (name, "(POS)" for the
 * sales slot, created date), search, add and edit (name, For Replenishment), delete (asked first).
 */
export function SlotsView({ warehouseId }: { warehouseId: string }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<SlotRow[]>([]);
  const listed = useRecordRows(rows, 'slot', (s: SlotRow) => s.id) ?? [];
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ row: SlotRow | null; form: SlotForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setSearch(typed), 400);
    return () => clearTimeout(h);
  }, [typed]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = slotQuery(warehouseId, search, offset);
      try {
        const r = await data.cachedRead('slots-page', qs, async () => (await api.call<{ result?: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?${qs}`)).result ?? { data: [], total: 0 });
        if (id !== run.current) return;
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      }
    },
    [data, api, warehouseId, search],
  );

  const { online, syncVersion } = state;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load(0);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, online, syncVersion]);

  const mayAdd = can(user, 'slot', 'create');
  const mayEdit = can(user, 'slot', 'update');
  const mayDelete = can(user, 'slot', 'delete');

  function save() {
    const e = editing!;
    if (!e.form.slotName.trim()) return;
    const body = slotBody(e.form, warehouseId, e.row ?? undefined);
    // kept on the phone and sent later when kh-pos can't be reached; kh-pos makes the id of a new slot, so it can't be edited until sent
    const id = e.row?.id ?? Crypto.randomUUID();
    void (async () => {
      setBusy(true);
      try {
        await writer({ entity: 'slot', op: e.row ? 'update' : 'create', recordId: id, method: e.row ? 'PUT' : 'POST', path: '/api/warehouse/slot', body, label: body.slotName, row: { id, name: body.slotName, warehouseId, forReplenishment: body.forReplenishment } });
        setEditing(null);
        await load(0);
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  function remove(s: SlotRow) {
    Alert.alert(t('slots.deleteTitle'), t('slots.deleteAsk', { name: s.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await writer({ entity: 'slot', op: 'delete', recordId: s.id, method: 'DELETE', path: '/api/warehouse/slot', body: { id: s.id }, label: s.name });
              await load(0);
            } catch (err) {
              Alert.alert(t('slots.deleteFailed'), err instanceof Error ? err.message : undefined);
            }
          })(),
      },
    ]);
  }

  const f = editing?.form;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.slots')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => setEditing({ row: null, form: emptySlot() })} /> : undefined} />
      <View style={styles.filters}>
        <Input value={typed} onChangeText={setTyped} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(s, i) => s.id ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || rows.length >= total || rows.length < SLOT_PAGE) return;
            setMoreLoading(true);
            await load(rows.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('slots.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item: s, index }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.no}>{index + 1}</Text>
                <Text style={[styles.heading, styles.flex]}>{slotTitle(s)}</Text>
                {s.forReplenishment ? <Badge tone="info" text={t('branches.replenishment')} /> : null}
              </View>
              <Text style={styles.muted}>{t('slots.created', { date: dateOnly(s.createdAt) })}</Text>
              <View style={styles.row}>
                {s.syncFailed ? <Badge tone="destructive" text={t('offline.syncFailed')} /> : s.pendingSync ? <Badge tone="info" text={t('offline.notSent')} /> : null}
                {mayEdit && !isUnsent(s, state.commands, 'slot', s.id) ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => setEditing({ row: s, form: slotForm(s) })} /> : null}
                {mayDelete && !isUnsent(s, state.commands, 'slot', s.id) ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(s)} /> : null}
              </View>
            </Card>
          )}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {editing && f ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.form}>
                <Text style={styles.title}>{t('slots.info')}</Text>
                <Text style={styles.label}>{t('branches.slotName')}</Text>
                <Input value={f.slotName} onChangeText={(v) => setEditing((e) => (e ? { ...e, form: { ...e.form, slotName: v } } : e))} placeholder={t('slots.nameHint')} autoFocus accessibilityLabel={t('branches.slotName')} />
                <ToggleRow label={t('branches.replenishment')} value={f.forReplenishment} onChange={(v) => setEditing((e) => (e ? { ...e, form: { ...e.form, forReplenishment: v } } : e))} />
              </View>
              <View style={styles.flex} />
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('slots.save')} disabled={!f.slotName.trim()} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  no: { fontSize: font.small, color: colors.mutedForeground, minWidth: 18 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  more: { marginVertical: space.lg },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

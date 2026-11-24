import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import type { BranchRow } from '@/lib/org';
import { deleteSteps, emptyGroup, groupForm, groupListQuery, GROUP_PAGE, heldLabel, pickedLabel, saveSteps, slimGroup, validateGroup, type GroupForm, type GroupRow, type PickedProduct } from '@/lib/product-groups';
import { useSession } from '@/lib/session';
import { dateOnly } from '@/lib/suppliers';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Product groups like the kh-pos web page: a named set of product variants and the branches that
 * show them. The list can be filtered by branch; saving a group also shows (or hides) its products in
 * its branches, exactly as the web form does. Needs the server to save.
 */
export default function ProductGroupsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();

  const [warehouseId, setWarehouseId] = useState('');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const listed = useRecordRows(groups, 'product-group', (g: GroupRow) => g.groupId) ?? [];
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ id: string; row: GroupRow | null; form: GroupForm; products: PickedProduct[]; warehouseIds: string[] } | null>(null);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++run.current;
      const qs = groupListQuery(offset, warehouseId);
      try {
        const r = await data.cachedRead('product-groups-page', qs, async () => {
          const res = (await api.call<{ result?: { result: GroupRow[]; total: number } }>('GET', `/api/product-v2/group?${qs}`)).result ?? { result: [], total: 0 };
          return { ...res, result: res.result.map(slimGroup) };
        });
        if (id !== run.current) return;
        setGroups((prev) => (offset === 0 ? r.data.result : [...prev, ...r.data.result]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      }
    },
    [data, api, warehouseId],
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

  useEffect(() => {
    data.cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setBranches(r.data), () => undefined);
  }, [data, api]);

  const mayAdd = can(user, 'product-group', 'create');
  const mayEdit = can(user, 'product-group', 'update');
  const mayDelete = can(user, 'product-group', 'delete');

  function open(row: GroupRow | null) {
    setProblem('');
    setEditing({
      id: row?.groupId ?? Crypto.randomUUID(),
      row,
      form: row ? groupForm(row) : emptyGroup(),
      products: row ? row.products.map((p) => ({ productId: p.productId, variantId: p.productVariantId, label: heldLabel(p) })) : [],
      warehouseIds: row ? row.warehouses.map((w) => w.warehouseId) : [],
    });
  }

  function save() {
    const e = editing!;
    if (validateGroup(e.form)) {
      setProblem(t('groups.error_name'));
      return;
    }
    setProblem('');
    // the calls are kept on the phone and sent later, in order, when kh-pos can't be reached (the group's id is made here)
    const steps = saveSteps({ id: e.id, existing: e.row, form: e.form, products: e.products, warehouseIds: e.warehouseIds });
    const first = steps[0]!;
    void (async () => {
      setBusy(true);
      try {
        await writer({
          entity: 'product-group',
          op: e.row ? 'update' : 'create',
          recordId: e.id,
          method: first.method,
          path: first.path,
          body: first.body,
          steps,
          label: e.form.name.trim(),
          row: {
            groupId: e.id,
            groupName: e.form.name.trim(),
            description: e.form.description.trim() || null,
            warehouses: e.warehouseIds.map((w) => ({ warehouseId: w, warehouse: { name: branches.find((b) => b.id === w)?.name ?? null } })),
            products: e.products.map((p) => ({ productId: p.productId, productVariantId: p.variantId, product: { title: p.label }, variant: null })),
          },
        });
        setEditing(null);
        await load(0);
      } catch {
        setProblem(t('groups.error_save'));
      } finally {
        setBusy(false);
      }
    })();
  }

  function remove(g: GroupRow) {
    Alert.alert(t('groups.deleteTitle'), t('groups.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const steps = deleteSteps(g);
              const first = steps[0]!;
              await writer({ entity: 'product-group', op: 'delete', recordId: g.groupId, method: first.method, path: first.path, body: first.body, steps, label: g.groupName });
              await load(0);
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          })(),
      },
    ]);
  }

  const e = editing;
  const set = (patch: Partial<NonNullable<typeof editing>>) => setEditing((cur) => (cur ? { ...cur, ...patch } : cur));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.productGroups')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => open(null)} /> : undefined} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t('groups.allWarehouses')} selected={warehouseId === ''} onPress={() => setWarehouseId('')} />
          {branches
            .filter((b) => b.id)
            .map((b) => (
              <Chip key={b.id} label={b.name} selected={warehouseId === b.id} onPress={() => setWarehouseId(b.id!)} />
            ))}
        </ScrollView>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {loading ? (
        <LoadingState />
      ) : error && groups.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(g) => g.groupId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || groups.length >= total || groups.length < GROUP_PAGE) return;
            setMoreLoading(true);
            await load(groups.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<Text style={styles.muted}>{t('groups.total', { count: total })}</Text>}
          ListEmptyComponent={<EmptyState title={t('groups.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : undefined}
          renderItem={({ item, index }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.no}>{index + 1}</Text>
                <Text style={[styles.heading, styles.flex]}>{item.groupName}</Text>
              </View>
              <Text style={styles.muted}>{item.description || '—'}</Text>
              <View style={styles.chips}>
                {item.warehouses.map((w) => (
                  <Badge key={w.warehouseId} tone="outline" text={w.warehouse?.name || w.warehouseId} />
                ))}
              </View>
              <Text style={styles.body}>{t('groups.productCount', { count: item.products.length })}</Text>
              <Text style={styles.muted}>{t('groups.createdBy', { name: item.createdBy?.fullname || '—', date: dateOnly(item.createdAt) })}</Text>
              <View style={styles.row}>
                {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => open(item)} /> : null}
                {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(item)} /> : null}
              </View>
            </Card>
          )}
        />
      )}

      <Modal visible={!!e} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {e ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.section}>{t('groups.general')}</Text>
                <Text style={styles.label}>{t('groups.name')}</Text>
                <Input value={e.form.name} onChangeText={(v) => set({ form: { ...e.form, name: v } })} placeholder={t('groups.nameHint')} accessibilityLabel={t('groups.name')} />
                <Text style={styles.label}>{t('groups.description')}</Text>
                <Input value={e.form.description} onChangeText={(v) => set({ form: { ...e.form, description: v } })} placeholder={t('groups.descriptionHint')} accessibilityLabel={t('groups.description')} />

                <Text style={styles.section}>{t('groups.products')}</Text>
                <Text style={styles.muted}>{t('groups.productsHint')}</Text>
                {e.products.map((p) => (
                  <View key={p.variantId} style={styles.pick}>
                    <Text style={styles.label2} numberOfLines={2}>{p.label}</Text>
                    <Button title="✕" variant="ghost" size="sm" onPress={() => set({ products: e.products.filter((x) => x.variantId !== p.variantId) })} />
                  </View>
                ))}
                <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />
                {e.products.length > 0 ? <Text style={styles.muted}>{t('groups.selectedProducts', { count: e.products.length })}</Text> : null}

                <Text style={styles.section}>{t('groups.branches')}</Text>
                <Text style={styles.muted}>{t('groups.branchesHint')}</Text>
                <View style={styles.chips}>
                  {branches
                    .filter((b) => b.id)
                    .map((b) => (
                      <Chip key={b.id} label={b.name} selected={e.warehouseIds.includes(b.id!)} onPress={() => set({ warehouseIds: e.warehouseIds.includes(b.id!) ? e.warehouseIds.filter((x) => x !== b.id) : [...e.warehouseIds, b.id!] })} />
                    ))}
                </View>
                {e.warehouseIds.length > 0 ? <Text style={styles.muted}>{t('groups.selectedBranches', { count: e.warehouseIds.length })}</Text> : null}

                {problem ? <Text style={styles.error}>{problem}</Text> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} disabled={busy} style={styles.flex} />
                <Button title={busy ? t('groups.saving') : e.row ? t('groups.update') : t('groups.create')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
          {picking && e ? (
            <VariantPicker
              api={api}
              onClose={() => setPicking(false)}
              onPick={(v) => {
                if (!e.products.some((p) => p.variantId === v.variantId)) set({ products: [...e.products, { productId: v.productId, variantId: v.variantId, label: pickedLabel(v.name) }] });
                setPicking(false);
              }}
            />
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
  chipRow: { gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, backgroundColor: colors.muted, borderRadius: radius.md, paddingLeft: space.sm },
  no: { fontSize: font.small, color: colors.mutedForeground, minWidth: 18 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  label2: { fontSize: font.small, color: colors.foreground, flexShrink: 1, flex: 1 },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', marginTop: space.sm },
  error: { fontSize: font.small, color: colors.destructive },
  more: { marginVertical: space.lg },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

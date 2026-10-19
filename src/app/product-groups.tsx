import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { BranchRow } from '@/lib/org';
import { assignBody, emptyGroup, groupBody, groupForm, notInGroup, productLabel, validateGroup, warehouseChanges, type GroupForm, type GroupRow } from '@/lib/product-groups';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Product groups like the kh-pos web page: a named set of product variants and the branches that
 * show them. Opening a group lets staff rename it, choose its branches, add or remove products, or delete it.
 * Saving needs the server.
 */
export default function ProductGroupsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean; row: GroupRow | null; form: GroupForm; wanted: string[]; added: { productId: string; variantId: string; label: string }[]; removed: { productId: string; variantId: string }[] } | null>(null);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('product-groups', 'all', async () => (await api.call<{ result?: { result: GroupRow[] } }>('GET', '/api/product-v2/group?limit=200&offset=0')).result?.result ?? []);
      setGroups(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);

  useEffect(() => {
    data.cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse-v2?limit=${l}&offset=${o}`)).result)).then((r) => setBranches(r.data), () => undefined);
  }, [data, api]);

  function open(row: GroupRow | null) {
    setProblem(false);
    setEditing({ id: row?.groupId ?? Crypto.randomUUID(), isNew: !row, row, form: row ? groupForm(row) : emptyGroup(), wanted: row ? row.warehouses.map((w) => w.warehouseId) : [], added: [], removed: [] });
  }

  function save() {
    const e = editing!;
    if (validateGroup(e.form)) {
      setProblem(true);
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.isNew ? 'POST' : 'PUT', '/api/product-v2/group', groupBody(e.form, e.id));
        const { add, remove } = warehouseChanges(e.row ? e.row.warehouses.map((w) => w.warehouseId) : [], e.wanted);
        const base = `/api/product-v2/group/${encodeURIComponent(e.id)}`;
        if (add.length) await api.call('POST', `${base}/warehouse`, { warehouseIds: add });
        if (remove.length) await api.call('DELETE', `${base}/warehouse`, { warehouseIds: remove });
        if (e.added.length) await api.call('POST', `${base}/products`, assignBody(e.added));
        if (e.removed.length) await api.call('DELETE', `${base}/products`, assignBody(e.removed));
        setEditing(null);
        setVersion((v) => v + 1);
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(g: GroupRow) {
    Alert.alert(t('admin.deleteConfirm', { name: g.groupName }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/product-v2/group', { groupId: g.groupId });
              setEditing(null);
              setVersion((v) => v + 1);
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const e = editing;
  const kept = e?.row ? e.row.products.filter((p) => !e.removed.some((r) => r.variantId === p.productVariantId)) : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.productGroups')} right={can(user, 'product-group', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => open(null)} /> : undefined} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {groups === null ? (
        error ? <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} /> : <LoadingState />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.groupId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('groups.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Text style={styles.heading}>{item.groupName}</Text>
              {item.description ? <Text style={styles.muted}>{item.description}</Text> : null}
              <Text style={styles.muted}>{t('groups.summary', { products: item.products.length, branches: item.warehouses.length })}</Text>
              {can(user, 'product-group', 'update') ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => open(item)} /> : null}
            </Card>
          )}
        />
      )}

      <Modal visible={!!e} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {e ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Input value={e.form.name} onChangeText={(v) => setEditing({ ...e, form: { ...e.form, name: v } })} placeholder={t('groups.name')} accessibilityLabel={t('groups.name')} />
                {problem ? <Text style={styles.error}>{t('groups.error_name')}</Text> : null}
                <Input value={e.form.description} onChangeText={(v) => setEditing({ ...e, form: { ...e.form, description: v } })} placeholder={t('groups.description')} multiline accessibilityLabel={t('groups.description')} />

                <Text style={styles.section}>{t('groups.branches')}</Text>
                <View style={styles.chips}>
                  {branches
                    .filter((b) => b.id)
                    .map((b) => (
                      <Chip key={b.id} label={b.name} selected={e.wanted.includes(b.id!)} onPress={() => setEditing({ ...e, wanted: e.wanted.includes(b.id!) ? e.wanted.filter((x) => x !== b.id) : [...e.wanted, b.id!] })} />
                    ))}
                </View>

                <Text style={styles.section}>{t('groups.products')}</Text>
                {kept.map((p) => (
                  <View key={p.productVariantId} style={styles.row}>
                    <Text style={styles.label} numberOfLines={2}>{productLabel(p)}</Text>
                    <Button title="✕" variant="ghost" size="sm" onPress={() => setEditing({ ...e, removed: [...e.removed, { productId: p.productId, variantId: p.productVariantId }] })} />
                  </View>
                ))}
                {e.added.map((p) => (
                  <View key={p.variantId} style={styles.row}>
                    <Text style={styles.label} numberOfLines={2}>{p.label}</Text>
                    <Button title="✕" variant="ghost" size="sm" onPress={() => setEditing({ ...e, added: e.added.filter((x) => x.variantId !== p.variantId) })} />
                  </View>
                ))}
                <Button title={`+ ${t('po.addItem')}`} variant="outline" onPress={() => setPicking(true)} />
                {e.row && can(user, 'product-group', 'delete') ? <Button title={t('admin.delete')} variant="outline" onPress={() => remove(e.row!)} /> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
          {picking && e ? (
            <VariantPicker
              api={api}
              onClose={() => setPicking(false)}
              onPick={(v) => {
                const inGroup = e.row ? notInGroup(e.row, v.variantId) || e.removed.some((r) => r.variantId === v.variantId) : true;
                const already = e.added.some((a) => a.variantId === v.variantId);
                if (inGroup && !already) setEditing({ ...e, added: [...e.added, { productId: v.productId, variantId: v.variantId, label: v.name }], removed: e.removed.filter((r) => r.variantId !== v.variantId) });
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
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  error: { fontSize: font.small, color: colors.destructive },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

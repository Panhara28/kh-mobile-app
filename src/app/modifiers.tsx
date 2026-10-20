import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { addOption, bindBody, boundProducts, canRemoveOption, emptyModifierForm, filterBound, matchesModifier, modifierFormOf, modifierProblem, modifierSaveBody, patchOption, removeOption, summary, type BoundProduct, type ModifierFormData, type ModifierItem } from '@/lib/modifiers';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Input } from '@/ui/components';
import { NumInput } from '@/ui/product-form/parts';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Modifiers like the kh-pos web Modifier page: a title, a description and options with additional
 * prices (shown with their count, creation date and creator), add / edit / delete, and "Applies to
 * Products" to choose the products that offer the modifier. Saving needs the server.
 */
export default function ModifiersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const insets = useSafeAreaInsets();
  const { currency, warehouseId } = useBranch();

  const [rows, setRows] = useState<ModifierItem[] | null>(null);
  const writer = useRecordWriter();
  const listed = useRecordRows(rows, 'modifier', (m: ModifierItem) => m.modifierId);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ row: ModifierItem | null; form: ModifierFormData } | null>(null);
  const [showProblem, setShowProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applies, setApplies] = useState<ModifierItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('modifiers-page', warehouseId, () => fetchAllPages<ModifierItem>(async (o, l) => (await api.call<{ result: { data: ModifierItem[]; total: number } }>('GET', `/api/modifier?limit=${Math.min(l, 100)}&offset=${o}`)).result));
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, warehouseId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, state.online, state.syncVersion]);

  const mayAdd = can(user, 'modifier', 'create');
  const mayEdit = can(user, 'modifier', 'update');
  const mayDelete = can(user, 'modifier', 'delete');

  function save() {
    const e = editing!;
    if (modifierProblem(e.form)) {
      setShowProblem(true);
      return;
    }
    const saved = modifierSaveBody(e.form, () => Crypto.randomUUID(), e.row ?? undefined);
    // kh-pos takes the id of a new modifier from the request, so one made here lets it be edited at once
    const id = e.row?.modifierId ?? Crypto.randomUUID();
    const body = { ...saved, id };
    // kept on the phone and sent later when kh-pos can't be reached
    void (async () => {
      setBusy(true);
      try {
        await writer({
          entity: 'modifier',
          op: e.row ? 'update' : 'create',
          recordId: id,
          method: e.row ? 'PUT' : 'POST',
          path: '/api/modifier',
          body,
          label: body.title,
          row: { modifierId: id, title: body.title, description: body.description, items: body.items.map((i) => ({ id: i.id, name: i.name, price: String(i.price) })) },
        });
        setEditing(null);
        await load();
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  function remove(m: ModifierItem) {
    Alert.alert(t('admin.deleteConfirm', { name: m.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await writer({ entity: 'modifier', op: 'delete', recordId: m.modifierId, method: 'DELETE', path: '/api/modifier', body: { id: m.modifierId }, label: m.title });
              await load();
            } catch (err) {
              Alert.alert(t('modifiers.deleteFailed'), err instanceof Error ? err.message : undefined);
            }
          })(),
      },
    ]);
  }

  const shown = (listed ?? []).filter((m) => matchesModifier(m, search));
  const f = editing?.form;
  const sum = f ? summary(f) : null;
  const problem = f ? modifierProblem(f) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.modifiers')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => { setShowProblem(false); setEditing({ row: null, form: emptyModifierForm() }); }} /> : undefined} />
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(m) => m.modifierId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={<Text style={styles.muted}>{t('modifiers.found', { count: rows.length })}</Text>}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item: m }) => {
            const open = expanded.has(m.modifierId);
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={[styles.heading, styles.flex]}>{m.title}</Text>
                  <Badge tone="info" text={t('modifiers.optionsN', { count: m.items?.length ?? 0 })} />
                </View>
                {m.description ? <Text style={styles.muted}>{m.description}</Text> : null}
                <Text style={styles.muted}>{[m.createdAt?.slice(0, 16), m.createdBy?.fullname || m.createdBy?.username].filter(Boolean).join(' · ')}</Text>
                {open ? (
                  <View style={styles.options}>
                    {(m.items ?? []).map((i) => (
                      <View key={i.id} style={styles.row}>
                        <Text style={[styles.body, styles.flex]}>{i.name}</Text>
                        <Text style={styles.price}>{Number(i.price) > 0 ? `+${formatMoney(Number(i.price), currency)}` : formatMoney(0, currency)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.chips}>
                  <Button title={open ? t('modifiers.hideOptions') : t('modifiers.showOptions')} variant="outline" size="sm" onPress={() => setExpanded((s) => { const n = new Set(s); if (n.has(m.modifierId)) n.delete(m.modifierId); else n.add(m.modifierId); return n; })} />
                  {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setShowProblem(false); setEditing({ row: m, form: modifierFormOf(m) }); }} /> : null}
                  <Button title={t('modifiers.appliesTo')} variant="outline" size="sm" onPress={() => setApplies(m)} />
                  {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(m)} /> : null}
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {editing && f && sum ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <View style={styles.row}>
                  <Text style={[styles.title, styles.flex]}>{editing.row ? t('modifiers.editTitle') : t('modifiers.createTitle')}</Text>
                  {sum.count > 0 ? <Badge tone="outline" text={t('modifiers.optionsN', { count: sum.count })} /> : null}
                  {sum.total > 0 ? <Badge tone="outline" text={t('modifiers.maxN', { amount: formatMoney(sum.total, currency) })} /> : null}
                </View>

                <Card style={styles.card}>
                  <Text style={styles.section}>{t('modifiers.basic')}</Text>
                  <Input value={f.title} onChangeText={(v) => setEditing({ ...editing, form: { ...f, title: v } })} placeholder={t('modifiers.titleHint')} accessibilityLabel={t('modifiers.title')} />
                  <Input value={f.description} onChangeText={(v) => setEditing({ ...editing, form: { ...f, description: v } })} placeholder={t('modifiers.descriptionHint')} multiline style={styles.multi} accessibilityLabel={t('modifiers.description')} />
                </Card>

                <Card style={styles.card}>
                  <View style={styles.row}>
                    <Text style={[styles.section, styles.flex]}>{t('modifiers.optionsTitle')}</Text>
                    <Button title={`+ ${t('modifiers.addOption')}`} variant="outline" size="sm" onPress={() => setEditing({ ...editing, form: addOption(f) })} />
                  </View>
                  {f.items.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.heading}>{t('modifiers.noOptions')}</Text>
                      <Text style={styles.muted}>{t('modifiers.noOptionsHint')}</Text>
                    </View>
                  ) : null}
                  {f.items.map((o, i) => (
                    <View key={i} style={styles.option}>
                      <Input value={o.name} onChangeText={(v) => setEditing({ ...editing, form: patchOption(f, i, { name: v }) })} placeholder={t('modifiers.optionHint')} accessibilityLabel={t('modifiers.optionName')} />
                      <NumInput label={t('modifiers.additionalPrice', { currency })} value={o.price} onChange={(n) => setEditing({ ...editing, form: patchOption(f, i, { price: n !== null && n >= 0 ? n : 0 }) })} />
                      {canRemoveOption(f) ? <Button title={t('modifiers.removeOption')} variant="ghost" size="sm" onPress={() => setEditing({ ...editing, form: removeOption(f, i) })} /> : null}
                    </View>
                  ))}
                </Card>

                {showProblem && problem && f.title.trim() ? (
                  <Card style={styles.card}>
                    <Text style={styles.warn}>{t('modifiers.complete')}</Text>
                    {problem === 'noOptions' ? <Text style={styles.warn}>• {t('modifiers.needOption')}</Text> : null}
                    {problem === 'optionName' ? <Text style={styles.warn}>• {t('modifiers.needNames')}</Text> : null}
                  </Card>
                ) : null}
                {showProblem && problem === 'title' ? <Text style={styles.error}>{t('admin.required')}</Text> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={editing.row ? t('modifiers.update') : t('modifiers.create')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {applies ? <AppliesToModal api={api} modifier={applies} canEdit={mayEdit} onClose={() => setApplies(null)} /> : null}
    </SafeAreaView>
  );
}

/** "Applies to Products": the products that offer the modifier, with search to add one and a button to remove one. */
function AppliesToModal({ api, modifier, canEdit, onClose }: { api: KhPosApi; modifier: ModifierItem; canEdit: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { currency } = useBranch();
  const insets = useSafeAreaInsets();
  const guard = useOnlineOnly();
  const [rows, setRows] = useState<BoundProduct[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState('');
  const [picking, setPicking] = useState(false);
  const [working, setWorking] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.call<{ result?: BoundProduct[] }>('GET', `/api/modifier/${encodeURIComponent(modifier.modifierId)}`);
      setRows(boundProducts(r.result ?? []));
    } catch (e) {
      setError(e);
    }
  }, [api, modifier.modifierId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const base = `/api/modifier/${encodeURIComponent(modifier.modifierId)}`;
  const apply = (productId: string, title: string) => {
    if (rows?.some((r) => r.product_id === productId)) {
      Alert.alert(t('modifiers.alreadyApplied', { name: title }));
      return;
    }
    guard(async () => {
      setWorking((w) => [...w, productId]);
      try {
        await api.call('POST', base, bindBody(productId));
        await load();
      } catch {
        Alert.alert(t('modifiers.applyFailed', { name: title }));
      } finally {
        setWorking((w) => w.filter((x) => x !== productId));
      }
    });
  };
  const unapply = (r: BoundProduct) =>
    guard(async () => {
      setWorking((w) => [...w, r.product_id]);
      try {
        await api.call('DELETE', base, bindBody(r.product_id));
        await load();
      } catch {
        Alert.alert(t('modifiers.removeFailed', { name: r.product?.title ?? '' }));
      } finally {
        setWorking((w) => w.filter((x) => x !== r.product_id));
      }
    });

  const visible = rows ? filterBound(rows, filter) : [];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title}>{t('modifiers.appliesTitle')}</Text>
            <Text style={styles.muted}>{modifier.title} — {t('modifiers.appliesHint')}</Text>
          </View>
          <Button title={t('common.close')} variant="ghost" size="sm" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {canEdit ? <Button title={`+ ${t('modifiers.addProduct')}`} variant="outline" onPress={() => setPicking(true)} /> : null}
          <Text style={styles.heading}>{t('modifiers.appliedProducts', { count: rows?.length ?? 0 })}</Text>
          {rows && rows.length > 5 ? <Input value={filter} onChangeText={setFilter} placeholder={t('modifiers.filterApplied')} autoCorrect={false} accessibilityLabel={t('modifiers.filterApplied')} /> : null}
          {rows === null ? (
            error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
          ) : rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.heading}>{t('modifiers.noProducts')}</Text>
              <Text style={styles.muted}>{t('modifiers.noProductsHint')}</Text>
            </View>
          ) : visible.length === 0 ? (
            <Text style={styles.muted}>{t('modifiers.noMatch', { filter })}</Text>
          ) : (
            visible.map((r) => (
              <Card key={r.product_id} style={[styles.card, working.includes(r.product_id) ? styles.dim : {}] as never}>
                <View style={styles.row}>
                  {r.images?.[0] ? <Image source={{ uri: r.images[0].url }} style={styles.img} resizeMode="cover" /> : <View style={[styles.img, styles.noimg]} />}
                  <View style={styles.flex}>
                    <Text style={styles.body} numberOfLines={2}>{r.product?.title || t('modifiers.untitled')}</Text>
                    <View style={styles.chips}>
                      {(r.variants ?? []).slice(0, 4).map((v) => (
                        <Badge key={v.id} tone="outline" text={v.price !== null ? `${v.name} ${formatMoney(Number(v.price), currency)}` : v.name} />
                      ))}
                      {(r.variants?.length ?? 0) > 4 ? <Text style={styles.muted}>+{(r.variants?.length ?? 0) - 4}</Text> : null}
                    </View>
                  </View>
                  {canEdit ? <Button title="✕" variant="ghost" size="sm" disabled={working.includes(r.product_id)} onPress={() => unapply(r)} /> : null}
                </View>
              </Card>
            ))
          )}
        </ScrollView>
        <View style={{ height: insets.bottom }} />
        {picking ? (
          <VariantPicker
            api={api}
            onClose={() => setPicking(false)}
            onPick={(v) => {
              setPicking(false);
              apply(v.productId, v.name.replace(/\s*\(.*\)$/, ''));
            }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  options: { gap: 4, paddingVertical: 4 },
  option: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.muted },
  img: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  body: { fontSize: font.body, color: colors.foreground },
  price: { fontSize: font.body, fontWeight: '700', color: colors.success },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  warn: { fontSize: font.small, color: colors.warning },
  error: { fontSize: font.small, color: colors.destructive },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  empty: { alignItems: 'center', padding: space.md, gap: 4 },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

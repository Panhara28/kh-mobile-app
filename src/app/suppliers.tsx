import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { dateOnly, emptySupplierForm, matchesSupplier, orNA, supplierFormOf, supplierProblem, supplierSaveBody, type SupplierFormData, type SupplierItem } from '@/lib/suppliers';
import { Badge, Button, Card, Input } from '@/ui/components';
import { ToggleRow } from '@/ui/product-form/parts';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Suppliers like the kh-pos web Supplier page: a numbered list (name, contact name, consignment,
 * phone, address, notes, created date), search, add, edit and delete (asked first). A shortcut opens
 * the Supplier Product Price page.
 */
export default function SuppliersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<SupplierItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ row: SupplierItem | null; form: SupplierFormData } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('suppliers-page', 'all', () => fetchAllPages<SupplierItem>(async (o, l) => (await api.call<{ result: { data: SupplierItem[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result));
      setRows(r.data);
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
  }, [load, state.online, state.syncVersion]);

  const mayAdd = can(user, 'supplier', 'create');
  const mayEdit = can(user, 'supplier', 'update');
  const mayDelete = can(user, 'supplier', 'delete');

  function save() {
    const e = editing!;
    if (supplierProblem(e.form)) return;
    const body = supplierSaveBody(e.form, e.row ?? undefined);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.row ? 'PUT' : 'POST', '/api/supplier', body);
        setEditing(null);
        await load();
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(s: SupplierItem) {
    Alert.alert(t('suppliers.deleteTitle'), t('suppliers.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/supplier', { id: s.id });
              await load();
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const shown = (rows ?? []).filter((s) => matchesSupplier(s, search));
  const f = editing?.form;
  const set = (patch: Partial<SupplierFormData>) => setEditing((e) => (e && e.form ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.suppliers')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => setEditing({ row: null, form: emptySupplierForm() })} /> : undefined} />
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
        <Button title={t('suppliers.prices')} variant="outline" size="sm" onPress={() => router.push('/supplier-prices')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={<Text style={styles.muted}>{t('suppliers.total', { count: rows.length })}</Text>}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item: s, index }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.no}>{index + 1}</Text>
                <Text style={[styles.heading, styles.flex]}>{orNA(s.name)}</Text>
                {s.isConsignment ? <Badge tone="info" text={t('suppliers.consignment')} /> : null}
              </View>
              <Text style={styles.body}>{t('suppliers.contactName')}: {orNA(s.contactName)}</Text>
              <Text style={styles.body}>{t('suppliers.contactPhone')}: {orNA(s.contactPhone)}</Text>
              <Text style={styles.body}>{t('suppliers.address')}: {orNA(s.address)}</Text>
              <Text style={styles.body}>{t('suppliers.note')}: {orNA(s.note)}</Text>
              {s.createdAt ? <Text style={styles.muted}>{t('suppliers.created', { date: dateOnly(s.createdAt) })}</Text> : null}
              <View style={styles.row}>
                {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => setEditing({ row: s, form: supplierFormOf(s) })} /> : null}
                {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(s)} /> : null}
              </View>
            </Card>
          )}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {editing && f ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{editing.row ? t('suppliers.editTitle') : t('suppliers.createTitle')}</Text>
                <Text style={styles.label}>{t('suppliers.name')}</Text>
                <Input value={f.name} onChangeText={(v) => set({ name: v })} placeholder={t('suppliers.name')} accessibilityLabel={t('suppliers.name')} />
                <Text style={styles.label}>{t('suppliers.contactName')}</Text>
                <Input value={f.contactName} onChangeText={(v) => set({ contactName: v })} placeholder={t('suppliers.contactNameHint')} accessibilityLabel={t('suppliers.contactName')} />
                <Text style={styles.label}>{t('suppliers.contactEmail')}</Text>
                <Input value={f.contactEmail} onChangeText={(v) => set({ contactEmail: v })} placeholder={t('suppliers.emailHint')} keyboardType="email-address" autoCapitalize="none" accessibilityLabel={t('suppliers.contactEmail')} />
                <Text style={styles.label}>{t('suppliers.contactPhone')}</Text>
                <Input value={f.contactPhone} onChangeText={(v) => set({ contactPhone: v })} placeholder={t('suppliers.phoneHint')} keyboardType="phone-pad" accessibilityLabel={t('suppliers.contactPhone')} />
                <Text style={styles.label}>{t('suppliers.address')}</Text>
                <Input value={f.address} onChangeText={(v) => set({ address: v })} placeholder={t('suppliers.address')} accessibilityLabel={t('suppliers.address')} />
                <Text style={styles.label}>{t('suppliers.note')}</Text>
                <Input value={f.note} onChangeText={(v) => set({ note: v })} placeholder={t('suppliers.noteHint')} multiline style={styles.multi} accessibilityLabel={t('suppliers.note')} />
                <ToggleRow label={t('suppliers.consignment')} value={f.isConsignment} onChange={(v) => set({ isConsignment: v })} />
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('suppliers.submit')} disabled={!!supplierProblem(f)} loading={busy} onPress={save} style={styles.flex} />
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
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  no: { fontSize: font.small, color: colors.mutedForeground, minWidth: 18 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable, Setting, TableInput } from '@/lib/api';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { cleanTable, emptyTableForm, formFromTable, tableOptions, validateTable } from '@/lib/table-form';
import { Button, Card, Field } from '@/ui/components';
import { NumberField, OptionField, TagsField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * The branch's tables like the kh-pos web table setup: add, edit and delete tables, or generate
 * several at once. Needs the server (it changes the branch's setup).
 */
export default function TableSetupScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { data } = useOffline();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [tables, setTables] = useState<RestaurantTable[] | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; form: TableInput } | null>(null);
  const [generating, setGenerating] = useState<{ count: number; key: string; capacity: number; section: string; shape: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTables((await data.tables()).data);
      setError(null);
    } catch (e) {
      setError(e);
    }
    data.settings(warehouseId).then((r) => setSettings(r.data), () => undefined);
  }, [data, warehouseId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { sections, shapes } = tableOptions(settings, warehouseId);
  const canCreate = can(user, 'table', 'create');
  const canUpdate = can(user, 'table', 'update');
  const canDelete = can(user, 'table', 'delete');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const bad = validateTable(editing.form);
    if (bad) {
      setProblem(bad);
      return;
    }
    const form = cleanTable(editing.form);
    const id = editing.id;
    // sent at once, or kept on the phone and sent when kh-pos can be reached
    const ok = await run(async () => {
      const how = id
        ? await writer({ entity: 'table-setup', op: 'update', recordId: id, method: 'PUT', path: '/api/table', body: { id, ...form }, label: form.tableNumber })
        : await writer({ entity: 'table-setup', op: 'create', recordId: `new:${Date.now()}`, method: 'POST', path: '/api/table', body: form, once: true, label: form.tableNumber });
      if (how === 'queued') Alert.alert(t('offline.savedOffline'));
    });
    if (ok) setEditing(null);
  }

  function confirmDelete(table: RestaurantTable) {
    Alert.alert(t('tableSetup.deleteConfirm', { name: table.table_name }), table.order ? t('tableSetup.hasOrder') : undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('tableSetup.delete'), style: 'destructive', onPress: () => void run(async () => { const how = await writer({ entity: 'table-setup', op: 'delete', recordId: table.id, method: 'DELETE', path: '/api/table', body: { id: table.id }, label: table.table_name }); if (how === 'queued') Alert.alert(t('offline.savedOffline')); }) },
    ]);
  }

  async function generate() {
    if (!generating) return;
    if (!generating.key.trim() || !generating.section.trim() || !generating.shape.trim() || generating.count < 1 || generating.capacity < 1) {
      setProblem('generate');
      return;
    }
    const g = generating;
    const ok = await run(async () => {
      const how = await writer({ entity: 'table-setup', op: 'action', recordId: `generate:${Date.now()}`, method: 'POST', path: '/api/table/layout', body: { count: Math.floor(g.count), default: { key: g.key.trim(), capacity: Math.floor(g.capacity), section: g.section.trim(), shape: g.shape.trim() } }, once: true, label: t('tableSetup.generate') });
      if (how === 'queued') Alert.alert(t('offline.savedOffline'));
    });
    if (ok) setGenerating(null);
  }

  const form = editing?.form;
  const update = (patch: Partial<TableInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  const err = (field: string) => (problem === field ? t('tableSetup.required') : undefined);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={t('tableSetup.title')}
        right={
          <>
            {canCreate ? <Button title={t('tableSetup.generate')} variant="outline" size="sm" onPress={() => { setProblem(null); setGenerating({ count: 5, key: 'T', capacity: 4, section: sections[0]?.value ?? '', shape: shapes[0]?.value ?? '' }); }} /> : null}
            {canCreate ? <Button title={`+ ${t('tableSetup.add')}`} size="sm" onPress={() => { setProblem(null); setEditing({ id: null, form: { ...emptyTableForm(), section: sections[0]?.value ?? '', tableShape: shapes[0]?.value ?? '' } }); }} /> : null}
          </>
        }
      />
      {tables === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          {tables.length === 0 ? <EmptyState title={t('tables.empty')} /> : null}
          {tables.map((tb) => (
            <Card key={tb.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading}>{tb.table_name}</Text>
                <Text style={styles.muted}>{[tb.section, tb.setting_capacity ? t('tables.seats', { count: tb.setting_capacity }) : null].filter(Boolean).join(' · ')}</Text>
              </View>
              {tb.special_features ? <Text style={styles.muted}>{tb.special_features}</Text> : null}
              <View style={styles.row}>
                {canUpdate ? <Button title={t('tableSetup.edit')} variant="outline" size="sm" onPress={() => { setProblem(null); setEditing({ id: tb.id, form: formFromTable(tb) }); }} /> : null}
                {canDelete ? <Button title={t('tableSetup.delete')} variant="ghost" size="sm" onPress={() => confirmDelete(tb)} /> : null}
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <Text style={styles.modalTitle}>{editing?.id ? t('tableSetup.edit') : t('tableSetup.add')}</Text>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {form ? (
                <>
                  <Field label={t('tableSetup.name')} value={form.tableNumber} onChangeText={(v) => update({ tableNumber: v })} error={err('tableNumber')} />
                  <NumberField label={t('tableSetup.capacity')} value={form.seatingCapacity} onChange={(n) => update({ seatingCapacity: n })} />
                  <OptionField label={t('tableSetup.section')} options={sections} value={form.section} onChange={(v) => update({ section: v })} error={err('section')} />
                  <OptionField label={t('tableSetup.shape')} options={shapes} value={form.tableShape} onChange={(v) => update({ tableShape: v })} error={err('tableShape')} />
                  <Field label={t('tableSetup.location')} value={form.locationDescription ?? ''} onChangeText={(v) => update({ locationDescription: v })} />
                  <TagsField label={t('tableSetup.features')} values={form.features} onChange={(v) => update({ features: v })} />
                  <Field label={t('tableSetup.notes')} value={form.additionalNotes ?? ''} onChangeText={(v) => update({ additionalNotes: v })} multiline />
                </>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
            <Button title={t('customize.save')} loading={busy} onPress={() => void save()} style={styles.flex} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!generating} animationType="slide" onRequestClose={() => setGenerating(null)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <Text style={styles.modalTitle}>{t('tableSetup.generate')}</Text>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {generating ? (
              <>
                <Text style={styles.muted}>{t('tableSetup.generateHint')}</Text>
                <NumberField label={t('tableSetup.count')} value={generating.count} onChange={(n) => setGenerating((g) => (g ? { ...g, count: n } : g))} />
                <Field label={t('tableSetup.prefix')} value={generating.key} onChangeText={(v) => setGenerating((g) => (g ? { ...g, key: v } : g))} />
                <NumberField label={t('tableSetup.capacity')} value={generating.capacity} onChange={(n) => setGenerating((g) => (g ? { ...g, capacity: n } : g))} />
                <OptionField label={t('tableSetup.section')} options={sections} value={generating.section} onChange={(v) => setGenerating((g) => (g ? { ...g, section: v } : g))} />
                <OptionField label={t('tableSetup.shape')} options={shapes} value={generating.shape} onChange={(v) => setGenerating((g) => (g ? { ...g, shape: v } : g))} />
                {problem === 'generate' ? <Text style={styles.error}>{t('tableSetup.required')}</Text> : null}
              </>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={() => setGenerating(null)} style={styles.flex} />
            <Button title={t('tableSetup.generate')} loading={busy} onPress={() => void generate()} style={styles.flex} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  modal: { flex: 1, backgroundColor: colors.page },
  modalTitle: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  form: { padding: space.md, gap: space.md },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

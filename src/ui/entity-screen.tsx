import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { isUnsent, type RecordRequest } from '@/lib/offline/records';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import * as Crypto from 'expo-crypto';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useOffline } from '@/lib/offline/provider';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Field, Input } from './components';
import { NumberField, OptionField, TagsField } from './form-fields';
import { ScreenHeader } from './screen-header';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StaleBanner } from './sync-status';
import { colors, font, radius, space } from './theme';

export interface FieldSpec<F> {
  key: keyof F & string;
  /** Already translated. */
  label: string;
  kind: 'text' | 'multiline' | 'number' | 'decimal' | 'select' | 'switch' | 'tags' | 'password';
  options?: { value: string; label: string }[];
  hint?: string;
  /** Hidden unless this returns true (for fields that depend on others). */
  visible?: (form: F) => boolean;
}

export interface EntityConfig<Row, F> {
  /** Already translated. */
  title: string;
  /** The kh-pos permission resource: Add needs create, Edit update, Delete delete. */
  resource: string;
  /** Saved-copy key (per screen). */
  cacheKey: string;
  load: () => Promise<Row[]>;
  rowKey: (r: Row) => string;
  rowTitle: (r: Row) => string;
  rowSubtitle?: (r: Row) => string | null | undefined;
  rowBadge?: (r: Row) => { text: string; tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'outline' } | null;
  searchText?: (r: Row) => string;
  emptyForm: () => F;
  toForm: (r: Row) => F;
  /** The form's fields; a function gets the loaded rows (for fields that pick one of them). */
  fields: FieldSpec<F>[] | ((rows: Row[]) => FieldSpec<F>[]);
  /** Returns the key of the first invalid field, or null. */
  validate?: (f: F) => (keyof F & string) | null;
  create?: (f: F) => Promise<unknown>;
  update?: (r: Row, f: F) => Promise<unknown>;
  remove?: (r: Row) => Promise<unknown>;
  /** Extra buttons on a row (for example "Products" or "Open"). */
  rowActions?: (r: Row, reload: () => void) => ReactNode;
  /** Extra buttons in the header. */
  headerActions?: ReactNode;
  /** Text for the delete confirmation. */
  deleteMessage?: (r: Row) => string;
  /**
   * Saves that wait for kh-pos when it can't be reached (add, edit and delete are kept on the phone and sent later).
   * Without this the screen needs kh-pos for every save.
   */
  offline?: {
    entity: string;
    /** The request of an add; `id` is made on the phone. `row` is the record as it should look on the list. */
    create?: (form: F, id: string) => Omit<RecordRequest, 'entity' | 'op' | 'recordId'> & { row: Row };
    update?: (row: Row, form: F) => Omit<RecordRequest, 'entity' | 'op' | 'recordId'> & { row: Partial<Row> };
    remove?: (row: Row) => Omit<RecordRequest, 'entity' | 'op' | 'recordId' | 'row'>;
    /** Whether the server accepts an id made on the phone for an add (then the new row can be edited at once). */
    clientId?: boolean;
  };
  /** A small picture on the left of each row. */
  rowImage?: (r: Row) => string | null | undefined;
  /** Extra content above / below the fields of the add and edit form (a picture, a list of branches ...). */
  renderTop?: (ctx: FormContext<Row, F>) => ReactNode;
  renderBottom?: (ctx: FormContext<Row, F>) => ReactNode;
}

export interface FormContext<Row, F> {
  row: Row | null;
  form: F;
  set: (key: string, value: unknown) => void;
}

/**
 * A searchable list with an add/edit form and delete, driven by a config. Used for the admin
 * screens (categories, modifiers, discounts, suppliers, ...): reading works from the saved copy
 * offline, changes need the server and say so when offline.
 */
export function EntityScreen<Row, F extends Record<string, unknown>>({ config }: { config: EntityConfig<Row, F> }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const load = useCachedLoad<Row[]>('entity', config.cacheKey, useCallback(() => config.load(), [config]));
  const writer = useRecordWriter();
  const { state: sync } = useOffline();
  const entity = config.offline?.entity ?? '';
  const listRows = useRecordRows<Row & object>(load.value as (Row & object)[] | null, entity, config.rowKey as (r: Row & object) => string);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ row: Row | null; form: F } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const canCreate = !!config.create && can(user, config.resource, 'create');
  const canUpdate = !!config.update && can(user, config.resource, 'update');
  const canDelete = !!config.remove && can(user, config.resource, 'delete');

  const rows = useMemo(() => {
    const all = ((config.offline ? listRows : load.value) ?? []) as Row[];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) => (config.searchText ? config.searchText(r) : config.rowTitle(r)).toLowerCase().includes(needle));
  }, [load.value, listRows, search, config]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load.reload();
      return true;
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error && e.message !== 'server' ? e.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editing) return;
    const bad = config.validate?.(editing.form) ?? null;
    if (bad) {
      setProblem(bad);
      return;
    }
    const { row, form } = editing;
    const o = config.offline;
    if (o && (row ? o.update : o.create)) {
      // kept on the phone and sent later when kh-pos can't be reached
      const ok = await run(async () => {
        if (row) await writer({ entity: o.entity, op: 'update', recordId: config.rowKey(row), ...o.update!(row, form) });
        else {
          const id = Crypto.randomUUID();
          await writer({ entity: o.entity, op: 'create', recordId: id, ...o.create!(form, id) });
        }
      });
      if (ok) setEditing(null);
      return;
    }
    await guard(async () => {
      const ok = await run(() => (row ? config.update!(row, form) : config.create!(form)));
      if (ok) setEditing(null);
    });
  }

  function confirmDelete(row: Row) {
    Alert.alert(t('admin.deleteConfirm', { name: config.rowTitle(row) }), config.deleteMessage?.(row), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () => {
          const o = config.offline;
          if (o?.remove) void run(() => writer({ entity: o.entity, op: 'delete', recordId: config.rowKey(row), ...o.remove!(row) }).then(() => undefined));
          else void guard(() => run(() => config.remove!(row)));
        },
      },
    ]);
  }

  const set = (key: string, value: unknown) => setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={config.title}
        right={
          <>
            {config.headerActions}
            {canCreate ? (
              <Button
                title={`+ ${t('admin.add')}`}
                size="sm"
                onPress={() => {
                  setProblem(null);
                  setEditing({ row: null, form: config.emptyForm() });
                }}
              />
            ) : null}
          </>
        }
      />
      <View style={styles.search}>
        <Input value={search} onChangeText={setSearch} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
      </View>
      {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}

      {load.value === null ? (
        load.loading ? <LoadingState /> : <ErrorState error={load.error} onRetry={() => void load.reload()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={config.rowKey}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load.reload();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item }) => {
            const flag = item as Row & { pendingSync?: boolean; syncFailed?: boolean };
            const unsent = !!config.offline && !config.offline.clientId && isUnsent(flag, sync.commands, config.offline.entity, config.rowKey(item));
            const badge = flag.syncFailed ? { text: t('offline.syncFailed'), tone: 'destructive' as const } : flag.pendingSync ? { text: t('offline.notSent'), tone: 'info' as const } : config.rowBadge?.(item);
            const sub = config.rowSubtitle?.(item);
            return (
              <Card style={styles.card}>
                <Pressable
                  disabled={!canUpdate || unsent}
                  onPress={() => {
                    setProblem(null);
                    setEditing({ row: item, form: config.toForm(item) });
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cardTop, pressed && styles.pressed]}
                >
                  {config.rowImage?.(item) ? <Image source={{ uri: config.rowImage(item)! }} style={styles.thumb} /> : null}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>
                      {config.rowTitle(item)}
                    </Text>
                    {sub ? (
                      <Text style={styles.muted} numberOfLines={2}>
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  {badge ? <Badge text={badge.text} tone={badge.tone ?? 'outline'} /> : null}
                </Pressable>
                {config.rowActions || canDelete ? (
                  <View style={styles.actions}>
                    {config.rowActions?.(item, () => void load.reload())}
                    {canDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => confirmDelete(item)} /> : null}
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <Text style={styles.modalTitle}>{editing?.row ? t('admin.edit') : t('admin.add')} · {config.title}</Text>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {editing ? config.renderTop?.({ row: editing.row, form: editing.form, set }) : null}
              {editing
                ? (typeof config.fields === 'function' ? config.fields(load.value ?? []) : config.fields)
                    .filter((f) => !f.visible || f.visible(editing.form))
                    .map((f) => {
                      const value = editing.form[f.key];
                      const error = problem === f.key ? t('admin.required') : undefined;
                      switch (f.kind) {
                        case 'number':
                        case 'decimal':
                          return <NumberField key={f.key} label={f.label} value={Number(value) || 0} decimal={f.kind === 'decimal'} onChange={(n) => set(f.key, n)} />;
                        case 'select':
                          return <OptionField key={f.key} label={f.label} options={f.options ?? []} value={String(value ?? '')} onChange={(v) => set(f.key, v)} error={error} />;
                        case 'switch':
                          return (
                            <View key={f.key} style={styles.switchRow}>
                              <Text style={styles.label}>{f.label}</Text>
                              <Switch value={!!value} onValueChange={(v) => set(f.key, v)} />
                            </View>
                          );
                        case 'tags':
                          return <TagsField key={f.key} label={f.label} values={(value as string[]) ?? []} onChange={(v) => set(f.key, v)} />;
                        default:
                          return (
                            <Field
                              key={f.key}
                              label={f.label}
                              value={String(value ?? '')}
                              onChangeText={(v) => set(f.key, v)}
                              multiline={f.kind === 'multiline'}
                              secureTextEntry={f.kind === 'password'}
                              autoCapitalize={f.kind === 'password' ? 'none' : undefined}
                              error={error}
                            />
                          );
                      }
                    })
                : null}
              {editing ? config.renderBottom?.({ row: editing.row, form: editing.form, set }) : null}
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
            <Button title={t('customize.save')} loading={busy} onPress={() => void save()} style={styles.flex} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  search: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pressed: { opacity: 0.7 },
  thumb: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.muted },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  label: { fontSize: font.body, color: colors.foreground, flex: 1 },
  modal: { flex: 1, backgroundColor: colors.page },
  modalTitle: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  form: { padding: space.md, gap: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

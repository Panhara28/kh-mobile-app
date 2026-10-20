import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { addResource, createRoleBody, removeResource, resourceLabel, togglePermission, toRoles, updateRoleBody, validateRoleName, type Permissions, type Role, type RoleRow } from '@/lib/accessibility';
import { can } from '@/lib/line';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { PermissionList } from '@/ui/accessibility/permission-list';
import { Badge, Button, Card, Field } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, space } from '@/ui/theme';

/**
 * Settings > General > Accessibility: every role and what it may use, like the web Accessibility page. Open a role,
 * switch Create / Update / Delete per resource (Read is always on), add or remove resources, then Save Changes.
 */
export default function AccessibilityScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const writer = useRecordWriter();
  const insets = useSafeAreaInsets();
  const load = useCachedLoad<Role[]>('accessibility', 'roles', useCallback(async () => toRoles((await api.call<RoleRow[]>('GET', '/api/user/role')) as unknown as RoleRow[]), [api]));
  const roles = useRecordRows(load.value, 'role', (r: Role) => r.id);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Permissions>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ name: string; permissions: Permissions } | null>(null);

  const mayCreate = can(user, 'accessibility', 'create');
  const mayUpdate = can(user, 'accessibility', 'update');
  const mayDelete = can(user, 'accessibility', 'delete');

  const current = (role: Role) => editing[role.id] ?? role.permissions;
  const edit = (role: Role, next: Permissions) => setEditing((e) => ({ ...e, [role.id]: next }));
  const discard = (id: string) =>
    setEditing((e) => {
      const n = { ...e };
      delete n[id];
      return n;
    });

  function save(role: Role) {
    const perms = editing[role.id];
    if (!perms) return;
    // kept on the phone and sent later when kh-pos can't be reached; the role shows its new permissions at once
    void (async () => {
      setBusy(role.id);
      try {
        const how = await writer({ entity: 'role', op: 'update', recordId: role.id, method: 'PUT', path: '/api/user/role', body: updateRoleBody(role, perms), label: role.role, row: { permissions: perms } });
        discard(role.id);
        await load.reload();
        Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'acc.saved'));
      } catch (e) {
        Alert.alert(t('acc.saveFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(null);
      }
    })();
  }

  function create() {
    if (!adding) return;
    const problem = validateRoleName(adding.name);
    if (problem) {
      Alert.alert(t(problem === 'empty' ? 'acc.nameEmpty' : 'acc.nameLong'));
      return;
    }
    // a new role is sent only once (kh-pos makes its id)
    void (async () => {
      setBusy('new');
      try {
        const how = await writer({ entity: 'role', op: 'create', recordId: `new:${adding.name.trim()}`, method: 'POST', path: '/api/user/role', body: createRoleBody(adding.name, adding.permissions), label: adding.name.trim(), once: true });
        setAdding(null);
        await load.reload();
        Alert.alert(t(how === 'queued' ? 'offline.savedOffline' : 'acc.created'));
      } catch (e) {
        Alert.alert(t('acc.createFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(null);
      }
    })();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('acc.title')} right={mayCreate ? <Button title={`+ ${t('acc.addRole')}`} size="sm" onPress={() => setAdding({ name: '', permissions: {} })} /> : null} />
      {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}
      {load.value === null ? (
        load.loading ? <LoadingState /> : <ErrorState error={load.error} onRetry={() => void load.reload()} />
      ) : (roles ?? []).length === 0 ? (
        <EmptyState title={t('acc.noRoles')} description={t('acc.noRolesHint')} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {(roles ?? []).map((role) => {
            const open = expanded === role.id;
            const changed = !!editing[role.id];
            return (
              <Card key={role.id} style={styles.card}>
                <Pressable accessibilityRole="button" onPress={() => setExpanded(open ? null : role.id)} style={styles.head}>
                  <Text style={styles.roleName}>{role.role}</Text>
                  {changed ? <Badge text={t('acc.modified')} tone="warning" /> : null}
                  <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
                </Pressable>
                {open ? (
                  <View style={styles.content}>
                    <PermissionList
                      permissions={current(role)}
                      canUpdate={mayUpdate}
                      canDelete={mayDelete}
                      canAdd={mayCreate}
                      onToggle={(resource, action, enabled) => edit(role, togglePermission(current(role), resource, action, enabled))}
                      onRemove={(resource) => {
                        edit(role, removeResource(current(role), resource));
                        Alert.alert(t('acc.removed', { name: resourceLabel(resource) }));
                      }}
                      onAdd={(resource) => edit(role, addResource(current(role), resource))}
                    />
                    {changed ? (
                      <View style={styles.actions}>
                        <Button title={t('common.cancel')} variant="outline" onPress={() => discard(role.id)} style={styles.flex} />
                        <Button title={t('acc.saveChanges')} loading={busy === role.id} onPress={() => save(role)} style={styles.flex} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!adding} animationType="slide" onRequestClose={() => setAdding(null)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <Text style={styles.modalTitle}>{t('acc.newRole')}</Text>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.muted}>{t('acc.newRoleHint')}</Text>
              {adding ? (
                <>
                  <Field label={t('acc.roleName')} value={adding.name} onChangeText={(name) => setAdding({ ...adding, name })} maxLength={50} placeholder={t('acc.roleName')} />
                  <PermissionList
                    permissions={adding.permissions}
                    canUpdate
                    canDelete
                    canAdd
                    onToggle={(resource, action, enabled) => setAdding({ ...adding, permissions: togglePermission(adding.permissions, resource, action, enabled) })}
                    onRemove={(resource) => setAdding({ ...adding, permissions: removeResource(adding.permissions, resource) })}
                    onAdd={(resource) => setAdding({ ...adding, permissions: addResource(adding.permissions, resource) })}
                  />
                </>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={() => setAdding(null)} style={styles.flex} />
            <Button title={t('acc.createRole')} loading={busy === 'new'} onPress={create} style={styles.flex} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  body: { padding: space.md, gap: space.md },
  card: { padding: space.md, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  roleName: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
  chevron: { fontSize: 20, color: colors.mutedForeground },
  content: { gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  modal: { flex: 1, backgroundColor: colors.page },
  modalTitle: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

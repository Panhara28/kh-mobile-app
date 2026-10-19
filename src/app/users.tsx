import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { emptyUser, userBody, userForm, validateUser, validNewPassword, type UserForm, type UserRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';
import { PromptDialog } from '@/ui/prompt-dialog';

interface RoleRow {
  id: string;
  role: string;
}
interface BranchRef {
  id?: string;
  name: string;
}

/** Staff accounts like the kh-pos web User page: add, edit, reset someone's password, delete. */
export default function UsersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const guard = useOnlineOnly();
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  // roles come back as a plain array; branches as { data, total }
  const roles = useCachedLoad<RoleRow[]>('roles', 'all', useCallback(async () => (await api.call<RoleRow[]>('GET', '/api/user/role')) as unknown as RoleRow[], [api])).value;
  const branches = useCachedLoad<BranchRef[]>('branches', 'all', useCallback(() => fetchAllPages<BranchRef>(async (o, l) => (await api.call<{ result: { data: BranchRef[]; total: number } }>('GET', `/api/warehouse-v2?limit=${l}&offset=${o}`)).result), [api])).value;

  const config = useMemo<EntityConfig<UserRow, UserForm>>(
    () => ({
      title: t('more.users'),
      resource: 'users',
      cacheKey: 'users',
      load: () => fetchAllPages<UserRow>(async (offset, limit) => (await api.call<{ result: { data: UserRow[]; total: number } }>('GET', `/api/user?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.fullname || r.username,
      rowSubtitle: (r) => [r.username, r.phoneNumber, r.warehouse?.name].filter(Boolean).join(' · '),
      rowBadge: (r) => (r.role?.role ? { text: r.role.role, tone: 'info' } : null),
      searchText: (r) => `${r.username} ${r.fullname ?? ''} ${r.phoneNumber ?? ''}`,
      emptyForm: () => emptyUser(user?.currentWarehouseId ?? ''),
      toForm: userForm,
      fields: [
        { key: 'username', label: t('users.username'), kind: 'text', visible: (f) => !f.id },
        { key: 'password', label: t('users.password'), kind: 'password', visible: (f) => !f.id },
        { key: 'fullname', label: t('users.fullname'), kind: 'text' },
        { key: 'phoneNumber', label: t('users.phone'), kind: 'text' },
        { key: 'roleId', label: t('users.role'), kind: 'select', options: (roles ?? []).map((r) => ({ value: r.id, label: r.role })) },
        { key: 'warehouseId', label: t('users.branch'), kind: 'select', options: (branches ?? []).map((b) => ({ value: b.id ?? '', label: b.name })) },
      ],
      validate: (f) => validateUser(f, !f.id),
      create: (f) => api.call('POST', '/api/user', userBody(f)),
      update: (r, f) => api.call('PUT', '/api/user', userBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/user', { id: r.id }),
      rowActions: (r) => (can(user, 'users', 'update') ? <Button title={t('users.resetPassword')} variant="outline" size="sm" onPress={() => setResetFor(r)} /> : null),
    }),
    [api, t, roles, branches, user],
  );

  async function reset(values: Record<string, string>) {
    const pw = values.password ?? '';
    if (!resetFor) return;
    if (!validNewPassword(pw)) {
      Alert.alert(t('users.passwordShort'));
      return;
    }
    const target = resetFor;
    guard(async () => {
      setBusy(true);
      try {
        await api.call('POST', '/api/user/reset-password', { userId: target.id, newPassword: pw });
        setResetFor(null);
        Alert.alert(t('users.passwordChanged'));
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <>
      <EntityScreen config={config} />
      {resetFor ? <PromptDialog title={t('users.resetFor', { name: resetFor.fullname || resetFor.username })} fields={[{ key: 'password', label: t('users.newPassword'), secure: true }]} busy={busy} onCancel={() => setResetFor(null)} onSubmit={(v) => void reset(v)} /> : null}
    </>
  );
}

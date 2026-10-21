import * as Crypto from 'expo-crypto';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { bindBody, canDeleteUser, canResetPassword, emptyUser, normalizePhone, roleLabel, userBody, userFormOf, validateReset, validateUser, type BindEntry, type RoleRef, type UserForm, type UserRow } from '@/lib/users';
import { Button } from '@/ui/components';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';
import { OptionField } from '@/ui/form-fields';
import { PromptDialog } from '@/ui/prompt-dialog';
import { ImageBox } from '@/ui/settings/editors';
import { BindUsers } from '@/ui/users/bind-section';

/**
 * Settings > Users, like the web User page: the staff of this branch with picture, name, phone and role;
 * add, edit (with the branches they are bound to), reset someone's password (owner), delete (not yourself).
 */
export default function UsersScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const writer = useRecordWriter();
  const { state } = useOffline();
  const online = state.online;
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = useRef<{ entries: BindEntry[]; group: number } | null>(null);

  // the roles come back as a plain array
  const roles = useCachedLoad<RoleRef[]>('roles', 'all', useCallback(async () => (await api.call<RoleRef[]>('GET', '/api/user/role')) as unknown as RoleRef[], [api])).value;
  const warehouseId = user?.currentWarehouseId ?? '';

  const config = useMemo<EntityConfig<UserRow, UserForm>>(
    () => ({
      title: t('sg.tile_users'),
      resource: 'users',
      cacheKey: 'users',
      load: () => fetchAllPages<UserRow>(async (offset, limit) => (await api.call<{ result: { data: UserRow[]; total: number } }>('GET', `/api/user?limit=${Math.min(limit, 100)}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.fullname || r.username,
      rowSubtitle: (r) => [r.username, r.phoneNumber, r.warehouse?.name].filter(Boolean).join(' · '),
      rowBadge: (r) => ({ text: roleLabel(r) ?? t('users.noRole'), tone: roleLabel(r) ? 'info' : 'outline' }),
      rowImage: (r) => (r.profile ? api.imageUrl(r.profile) : null),
      searchText: (r) => `${r.username} ${r.fullname ?? ''} ${r.phoneNumber ?? ''}`,
      emptyForm: () => emptyUser(Crypto.randomUUID(), warehouseId, roles ?? []),
      toForm: (r) => {
        bind.current = null;
        return userFormOf(r);
      },
      renderTop: ({ form, set }) => <ImageBox label={t('users.profile')} url={String(form.profile)} onChange={(u) => set('profile', u)} disabled={false} />,
      fields: [
        { key: 'fullname', label: t('users.fullname'), kind: 'text' },
        { key: 'phoneNumber', label: t('users.phone'), kind: 'text' },
        { key: 'username', label: t('users.username'), kind: 'text', visible: (f) => f.isNew },
        { key: 'password', label: t('users.password'), kind: 'password', visible: (f) => f.isNew },
      ],
      renderBottom: ({ row, form, set }) => (
        <>
          <OptionField label={t('users.role')} options={(roles ?? []).map((r) => ({ value: r.id, label: r.role }))} value={String(form.roleId)} onChange={(v) => set('roleId', v === form.roleId ? '' : v)} />
          {row ? <BindUsers userId={row.id} warehouseId={row.currentWarehouseId ?? warehouseId} onChange={(entries, group) => (bind.current = { entries, group })} /> : null}
        </>
      ),
      validate: validateUser,
      create: (f) => api.call('POST', '/api/user', userBody({ ...f, phoneNumber: normalizePhone(f.phoneNumber) })),
      update: async (r, f) => {
        await api.call('PUT', '/api/user', userBody({ ...f, phoneNumber: normalizePhone(f.phoneNumber) }));
        // the whole list of branches goes to kh-pos, which works out what was added and removed
        if (bind.current && bind.current.entries.length > 0) await api.call('POST', '/api/user/bind-user', bindBody(bind.current.entries, bind.current.group, r.id, r.currentWarehouseId ?? warehouseId));
      },
      remove: (r) => (canDeleteUser(r.id, user?.id) ? api.call('DELETE', '/api/user', { id: r.id }) : Promise.reject(new Error(t('users.cannotDeleteSelf')))),
      deleteMessage: (r) => t('users.deleteAsk', { name: r.fullname || r.username }),
      // add, edit and delete are kept on the phone and sent later; the password of a new user is sealed with a key held in
      // the phone's secure storage, so the SQLite file never holds it in the clear
      offline: {
        entity: 'user',
        clientId: true,
        create: (f, id) => {
          const body = userBody({ ...f, id, phoneNumber: normalizePhone(f.phoneNumber) });
          const role = (roles ?? []).find((x) => x.id === f.roleId);
          return {
            method: 'POST' as const,
            path: '/api/user',
            body,
            secret: true,
            once: true,
            label: body.fullname || body.username,
            row: { id, username: body.username, fullname: body.fullname, phoneNumber: body.phoneNumber, profile: body.profile, roleId: body.roleId, role: role ? { id: role.id, role: role.role } : null, currentWarehouseId: body.warehouseId } as unknown as UserRow & Record<string, unknown>,
          };
        },
        update: (r, f) => {
          const body = userBody({ ...f, phoneNumber: normalizePhone(f.phoneNumber) });
          // the branches the person is bound to are sent only when the list was loaded (online); they make accounts, so then it is sent once
          const bindStep = online && bind.current && bind.current.entries.length > 0 ? { method: 'POST' as const, path: '/api/user/bind-user', body: bindBody(bind.current.entries, bind.current.group, r.id, r.currentWarehouseId ?? warehouseId) } : null;
          const role = (roles ?? []).find((x) => x.id === f.roleId);
          return {
            method: 'PUT' as const,
            path: '/api/user',
            body,
            steps: bindStep ? [{ method: 'PUT' as const, path: '/api/user', body }, bindStep] : undefined,
            once: !!bindStep,
            label: body.fullname || body.username,
            row: { fullname: body.fullname, phoneNumber: body.phoneNumber, profile: body.profile, roleId: body.roleId, role: role ? { id: role.id, role: role.role } : null },
          };
        },
        remove: (r) => {
          if (!canDeleteUser(r.id, user?.id)) throw new Error(t('users.cannotDeleteSelf'));
          return { method: 'DELETE' as const, path: '/api/user', body: { id: r.id }, label: r.fullname || r.username };
        },
      },
      headerActions: can(user, 'users', 'create') ? <Button title={t('uimport.button')} variant="outline" size="sm" onPress={() => router.push('/user-import' as never)} /> : undefined,
      rowActions: (r) =>
        can(user, 'users', 'update') && canResetPassword(user?.role?.role, r.id, user?.id) ? <Button title={t('users.resetPassword')} variant="outline" size="sm" onPress={() => setResetFor(r)} /> : null,
    }),
    [api, t, roles, user, warehouseId, online],
  );

  async function reset(values: Record<string, string>) {
    if (!resetFor) return;
    const problem = validateReset(values.password ?? '', values.confirm ?? '');
    if (problem) {
      Alert.alert(t(problem === 'newPassword' ? 'users.passwordShort' : 'users.passwordMismatch'));
      return;
    }
    const target = resetFor;
    setBusy(true);
    try {
      // sent at once, or kept on the phone (sealed) and sent when kh-pos can be reached
      const how = await writer({ entity: 'user', op: 'action', recordId: `reset:${target.id}`, method: 'POST', path: '/api/user/reset-password', body: { userId: target.id, newPassword: values.password }, secret: true, once: true, label: `${t('users.resetPassword')}: ${target.fullname || target.username}` });
      setResetFor(null);
      Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('users.passwordChanged'));
    } catch (e) {
      Alert.alert(t('users.resetFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <EntityScreen config={config} />
      {resetFor ? (
        <PromptDialog
          title={t('users.resetFor', { name: resetFor.fullname || resetFor.username })}
          fields={[
            { key: 'password', label: t('users.newPassword'), secure: true },
            { key: 'confirm', label: t('users.confirmPassword'), secure: true },
          ]}
          busy={busy}
          onCancel={() => setResetFor(null)}
          onSubmit={(v) => void reset(v)}
        />
      ) : null}
    </>
  );
}

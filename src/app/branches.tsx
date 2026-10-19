import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { branchBody, branchForm, emptyBranch, validateBranch, type BranchForm, type BranchRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Branches (warehouses) like the kh-pos web Warehouse page: add with the owner's login, edit, delete, and open a branch's stock slots. */
export default function BranchesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const config = useMemo<EntityConfig<BranchRow, BranchForm>>(
    () => ({
      title: t('more.branches'),
      resource: 'warehouse',
      cacheKey: 'branches-full',
      load: () => fetchAllPages<BranchRow>(async (offset, limit) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse-v2?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id ?? r.name,
      rowTitle: (r) => r.name,
      rowSubtitle: (r) => [r.ownerName, r.phoneNumber, r.address].filter(Boolean).join(' · '),
      rowBadge: (r) => (r.isMain ? { text: t('branches.main'), tone: 'success' } : null),
      searchText: (r) => `${r.name} ${r.ownerName ?? ''}`,
      emptyForm: emptyBranch,
      toForm: branchForm,
      fields: [
        { key: 'warehouseName', label: t('branches.name'), kind: 'text' },
        { key: 'ownerName', label: t('branches.owner'), kind: 'text' },
        { key: 'phoneNumber', label: t('users.phone'), kind: 'text' },
        { key: 'address', label: t('suppliers.address'), kind: 'multiline' },
        { key: 'userName', label: t('branches.ownerLogin'), kind: 'text', visible: (f) => !f.id },
        { key: 'password', label: t('users.password'), kind: 'password', visible: (f) => !f.id },
        { key: 'useMainBranchVisibility', label: t('branches.useMainVisibility'), kind: 'switch' },
      ],
      validate: (f) => validateBranch(f, !f.id),
      create: (f) => api.call('POST', '/api/warehouse-v2', branchBody(f)),
      update: (r, f) => api.call('PUT', '/api/warehouse-v2', branchBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/warehouse-v2', { id: r.id }),
      rowActions: (r) => (r.id && can(user, 'slot', 'read') ? <Button title={t('branches.slots')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/slots/[warehouseId]', params: { warehouseId: r.id! } })} /> : null),
    }),
    [api, t, user],
  );
  return <EntityScreen config={config} />;
}

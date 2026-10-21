import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { accountBody, accountForm, emptyAccount, validateAccount, type AccountForm, type AccountRow } from '@/lib/accounting';
import { fetchAllPages } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Chart of accounts like the kh-pos web page: named revenue and expense accounts that bookings are made against. */
export default function ChartOfAccountsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<AccountRow, AccountForm>>(
    () => ({
      title: t('more.chartOfAccounts'),
      resource: 'accounting',
      cacheKey: 'chart-of-accounts',
      load: () => fetchAllPages<AccountRow>(async (offset, limit) => (await api.call<{ result: { data: AccountRow[]; total: number } }>('GET', `/api/accounting/chart-of-account?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.accountName,
      rowBadge: (r) => ({ text: t(`accounting.type_${r.accountType}`), tone: r.accountType === 'revenue' ? 'success' : 'warning' }),
      searchText: (r) => r.accountName,
      emptyForm: emptyAccount,
      toForm: accountForm,
      fields: [
        { key: 'accountName', label: t('accounting.accountName'), kind: 'text' },
        {
          key: 'accountType',
          label: t('accounting.accountType'),
          kind: 'select',
          options: [
            { value: 'revenue', label: t('accounting.type_revenue') },
            { value: 'expense', label: t('accounting.type_expense') },
          ],
        },
      ],
      validate: validateAccount,
      create: (f) => api.call('POST', '/api/accounting/chart-of-account', accountBody(f)),
      update: (r, f) => api.call('PUT', '/api/accounting/chart-of-account', accountBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/accounting/chart-of-account', { id: r.id }),
      // add, edit and delete are kept on the phone and sent when kh-pos can be reached (kh-pos makes the id of a new account)
      offline: {
        entity: 'chart-of-account',
        create: (f, id) => ({ method: 'POST', path: '/api/accounting/chart-of-account', body: accountBody(f), once: true, label: f.accountName.trim(), row: { id, accountName: f.accountName.trim(), accountType: f.accountType } as unknown as AccountRow & Record<string, unknown> }),
        update: (r, f) => ({ method: 'PUT', path: '/api/accounting/chart-of-account', body: accountBody(f, r), label: f.accountName.trim(), row: { accountName: f.accountName.trim(), ...(f.accountType ? { accountType: f.accountType } : {}) } }),
        remove: (r) => ({ method: 'DELETE', path: '/api/accounting/chart-of-account', body: { id: r.id }, label: r.accountName }),
      },
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

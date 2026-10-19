import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAllPages } from '@/lib/catalog';
import { customerBody, emptyCustomer, validateCustomer, type CustomerForm, type CustomerRow } from '@/lib/customers';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Customers (walk-in and delivery) like the kh-pos web Delivery page: contact details, type and the delivery fee. */
export default function CustomersScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<CustomerRow, CustomerForm>>(
    () => ({
      title: t('more.customers'),
      resource: 'order',
      cacheKey: 'customers',
      load: () => fetchAllPages<CustomerRow>(async (offset, limit) => (await api.call<{ result: { data: CustomerRow[]; total: number } }>('GET', `/api/auth/customer?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.customerName,
      rowSubtitle: (r) => [r.phone, r.address].filter(Boolean).join(' · '),
      rowBadge: (r) => (r.type === 'delivery' ? { text: Number(r.extraPrice) > 0 ? `${t('orderType.food_delivery')} +${Number(r.extraPrice)}` : t('orderType.food_delivery'), tone: 'info' } : null),
      searchText: (r) => `${r.customerName} ${r.phone}`,
      emptyForm: emptyCustomer,
      toForm: (r) => ({ customerName: r.customerName, phone: r.phone, address: r.address ?? '', type: r.type ?? 'general', extraPrice: Number(r.extraPrice) || 0 }),
      fields: [
        { key: 'customerName', label: t('orderType.customerName'), kind: 'text' },
        { key: 'phone', label: t('users.phone'), kind: 'text' },
        { key: 'address', label: t('suppliers.address'), kind: 'multiline' },
        {
          key: 'type',
          label: t('discounts.type'),
          kind: 'select',
          options: [
            { value: 'general', label: t('customers.general') },
            { value: 'delivery', label: t('orderType.food_delivery') },
          ],
        },
        { key: 'extraPrice', label: t('orderType.extraPrice'), kind: 'decimal', visible: (f) => f.type === 'delivery' },
      ],
      validate: validateCustomer,
      create: (f) => api.call('POST', '/api/auth/customer', customerBody(f)),
      update: (r, f) => api.call('PUT', `/api/auth/customer/${encodeURIComponent(r.id)}`, customerBody(f)),
      remove: (r) => api.call('DELETE', `/api/auth/customer/${encodeURIComponent(r.id)}`),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { emptySupplier, fetchAllPages, supplierBody, supplierForm, type SupplierForm, type SupplierRow } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Suppliers like the kh-pos web Supplier page: contact details and whether they supply on consignment. */
export default function SuppliersScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<SupplierRow, SupplierForm>>(
    () => ({
      title: t('more.suppliers'),
      resource: 'supplier',
      cacheKey: 'suppliers',
      load: () => fetchAllPages<SupplierRow>(async (offset, limit) => (await api.call<{ result: { data: SupplierRow[]; total: number } }>('GET', `/api/supplier?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.name,
      rowSubtitle: (r) => [r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || r.address || null,
      rowBadge: (r) => (r.isConsignment ? { text: t('suppliers.consignment'), tone: 'info' } : null),
      searchText: (r) => `${r.name} ${r.contactName ?? ''} ${r.contactPhone ?? ''}`,
      emptyForm: emptySupplier,
      toForm: supplierForm,
      fields: [
        { key: 'name', label: t('suppliers.name'), kind: 'text' },
        { key: 'contactName', label: t('suppliers.contactName'), kind: 'text' },
        { key: 'contactPhone', label: t('suppliers.contactPhone'), kind: 'text' },
        { key: 'contactEmail', label: t('suppliers.contactEmail'), kind: 'text' },
        { key: 'address', label: t('suppliers.address'), kind: 'multiline' },
        { key: 'note', label: t('suppliers.note'), kind: 'multiline' },
        { key: 'isConsignment', label: t('suppliers.consignment'), kind: 'switch' },
      ],
      validate: (f) => (f.name.trim() ? null : 'name'),
      create: (f) => api.call('POST', '/api/supplier', supplierBody(f)),
      update: (r, f) => api.call('PUT', '/api/supplier', supplierBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/supplier', { id: r.id }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

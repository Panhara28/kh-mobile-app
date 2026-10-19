import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { discountBody, discountForm, emptyDiscount, fetchAllPages, validateDiscount, type DiscountForm, type DiscountRow } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Discounts like the kh-pos web Discount page: a title, amount or percentage, and its value. */
export default function DiscountsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const warehouseId = user?.currentWarehouseId ?? '';
  const config = useMemo<EntityConfig<DiscountRow, DiscountForm>>(
    () => ({
      title: t('more.discounts'),
      resource: 'discount',
      cacheKey: 'discounts',
      load: () => fetchAllPages<DiscountRow>(async (offset, limit) => (await api.call<{ result: { data: DiscountRow[]; total: number } }>('GET', `/api/discount?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.title,
      rowSubtitle: (r) => r.description || null,
      rowBadge: (r) => ({ text: r.discountType === 'PERCENTAGE' ? `${r.value}%` : `$${r.value}`, tone: 'success' }),
      searchText: (r) => `${r.title} ${r.description ?? ''}`,
      emptyForm: emptyDiscount,
      toForm: discountForm,
      fields: [
        { key: 'title', label: t('discounts.title'), kind: 'text' },
        { key: 'description', label: t('discounts.description'), kind: 'multiline' },
        {
          key: 'discountType',
          label: t('discounts.type'),
          kind: 'select',
          options: [
            { value: 'PERCENTAGE', label: t('discounts.percentage') },
            { value: 'AMOUNT', label: t('discounts.amount') },
          ],
        },
        { key: 'value', label: t('discounts.value'), kind: 'decimal' },
      ],
      validate: validateDiscount,
      create: (f) => api.call('POST', '/api/discount', discountBody(f, warehouseId, () => Crypto.randomUUID())),
      update: (r, f) => api.call('PUT', '/api/discount', discountBody(f, warehouseId, () => Crypto.randomUUID(), r)),
      remove: (r) => api.call('DELETE', '/api/discount', { id: r.id }),
    }),
    [api, t, warehouseId],
  );
  return <EntityScreen config={config} />;
}

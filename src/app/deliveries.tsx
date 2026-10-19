import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAllPages } from '@/lib/catalog';
import { deliveryBody, deliveryFormOf, deliverySubtitle, emptyDelivery, validateDelivery, type DeliveryForm, type DeliveryRow } from '@/lib/delivery';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/**
 * Settings > Delivery: the delivery customers of this branch (name, address, extra price), like the web
 * Delivery page. Only restaurant POS branches have it. The server counts a delivery's extra price into its orders.
 */
export default function DeliveryScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<DeliveryRow, DeliveryForm>>(
    () => ({
      title: t('sg.tile_delivery'),
      resource: 'delivery',
      cacheKey: 'delivery-customers',
      load: () => fetchAllPages<DeliveryRow>(async (offset, limit) => (await api.call<{ result: { data: DeliveryRow[]; total: number } }>('GET', `/api/auth/customer?limit=${Math.min(limit, 100)}&offset=${offset}&type=delivery`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.customerName,
      rowSubtitle: (r) => deliverySubtitle(r, t('delivery.orders')),
      searchText: (r) => `${r.customerName} ${r.address ?? ''}`,
      emptyForm: emptyDelivery,
      toForm: deliveryFormOf,
      fields: [
        { key: 'customerName', label: t('delivery.name'), kind: 'text' },
        { key: 'address', label: t('delivery.address'), kind: 'multiline' },
        { key: 'extraPrice', label: t('delivery.extraPrice'), kind: 'decimal' },
      ],
      validate: validateDelivery,
      create: (f) => api.call('POST', '/api/auth/customer', deliveryBody(f)),
      update: (r, f) => api.call('PUT', `/api/auth/customer/${encodeURIComponent(r.id)}`, deliveryBody(f)),
      remove: (r) => api.call('DELETE', `/api/auth/customer/${encodeURIComponent(r.id)}`),
      deleteMessage: (r) => t('delivery.deleteAsk', { name: r.customerName }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentMethod } from '@/lib/api';
import type { PaymentMethodForm } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Payment methods (Cash, ABA, ...) like the kh-pos web payment setting. */
export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<PaymentMethod, PaymentMethodForm>>(
    () => ({
      title: t('more.paymentMethods'),
      resource: 'payment',
      cacheKey: 'payment-methods',
      load: () => api.paymentMethods(),
      rowKey: (r) => r.method_id,
      rowTitle: (r) => r.method ?? r.method_id,
      emptyForm: () => ({ method: '' }),
      toForm: (r) => ({ method: r.method ?? '' }),
      fields: [{ key: 'method', label: t('paymentMethods.name'), kind: 'text' }],
      validate: (f) => (f.method.trim() ? null : 'method'),
      create: (f) => api.call('POST', '/api/payment/method', { method: f.method.trim() }),
      update: (r, f) => api.call('PUT', '/api/payment/method', { id: r.method_id, method: f.method.trim() }),
      remove: (r) => api.call('DELETE', '/api/payment/method', { id: r.method_id }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

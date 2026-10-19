import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createdText, emptyMethodForm, methodBody, methodFormOf, methodProblem, numbered, type MethodForm, type MethodItem, type MethodRow } from '@/lib/payment-methods';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/**
 * Payment methods (Cash, ABA, ...) like the kh-pos web Payment Method page: the numbered list with
 * each method's created date, add, rename and delete (asked first). Cashiers pick from these at checkout.
 */
export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<MethodRow, MethodForm>>(
    () => ({
      title: t('more.paymentMethods'),
      resource: 'payment',
      cacheKey: 'payment-methods',
      load: async () => numbered((await api.paymentMethods()) as MethodItem[]),
      rowKey: (r) => r.method_id,
      rowTitle: (r) => r.method ?? r.method_id,
      rowSubtitle: (r) => [`#${r.no}`, createdText(r)].filter(Boolean).join(' · '),
      searchText: (r) => r.method ?? '',
      emptyForm: emptyMethodForm,
      toForm: methodFormOf,
      fields: [{ key: 'method', label: t('paymentMethods.name'), kind: 'text' }],
      validate: methodProblem,
      create: (f) => api.call('POST', '/api/payment/method', methodBody(f)),
      update: (r, f) => api.call('PUT', '/api/payment/method', methodBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/payment/method', { id: r.method_id }),
      deleteMessage: (r) => t('paymentMethods.deleteAsk', { name: r.method ?? '' }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

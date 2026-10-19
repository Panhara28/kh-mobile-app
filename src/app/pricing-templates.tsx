import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DAY_TYPES, emptyTemplate, extrasText, templateBody, templateForm, TIME_SLOTS, validateTemplate, type TemplateForm, type TemplateRow } from '@/lib/pricing-templates';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Cinema pricing templates like the kh-pos web page: when a price list applies and what each seat type costs extra. */
export default function PricingTemplatesScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<TemplateRow, TemplateForm>>(
    () => ({
      title: t('more.pricingTemplates'),
      resource: 'pricing-template',
      cacheKey: 'pricing-templates',
      load: async () => (await api.call<{ result?: TemplateRow[] }>('GET', '/api/cinema/pricing-template')).result ?? [],
      rowKey: (r) => r.template_id,
      rowTitle: (r) => r.template_name,
      rowSubtitle: (r) => [t(`pricing.slot_${r.time_slot}`), t(`pricing.day_${r.day_type}`), extrasText(r)].filter(Boolean).join(' · '),
      searchText: (r) => r.template_name,
      emptyForm: emptyTemplate,
      toForm: templateForm,
      fields: [
        { key: 'name', label: t('pricing.name'), kind: 'text' },
        { key: 'timeSlot', label: t('pricing.timeSlot'), kind: 'select', options: TIME_SLOTS.map((s) => ({ value: s, label: t(`pricing.slot_${s}`) })) },
        { key: 'dayType', label: t('pricing.dayType'), kind: 'select', options: DAY_TYPES.map((d) => ({ value: d, label: t(`pricing.day_${d}`) })) },
        { key: 'standard', label: t('pricing.seat_standard'), kind: 'decimal' },
        { key: 'wheelchair', label: t('pricing.seat_wheelchair'), kind: 'decimal' },
        { key: 'vip', label: t('pricing.seat_vip'), kind: 'decimal' },
        { key: 'couple', label: t('pricing.seat_couple'), kind: 'decimal' },
      ],
      validate: validateTemplate,
      create: (f) => api.call('POST', '/api/cinema/pricing-template', templateBody(f)),
      update: (r, f) => api.call('PUT', '/api/cinema/pricing-template', templateBody(f, r)),
      remove: (r) => api.call('DELETE', '/api/cinema/pricing-template', { id: r.template_id }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

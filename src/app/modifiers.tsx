import * as Crypto from 'expo-crypto';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { emptyModifier, fetchAllPages, modifierBody, modifierForm, type ModifierForm, type ModifierRow } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Option groups (modifiers) like the kh-pos web Modifier page: a title and its options with prices. */
export default function ModifiersScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const config = useMemo<EntityConfig<ModifierRow, ModifierForm>>(
    () => ({
      title: t('more.modifiers'),
      resource: 'modifier',
      cacheKey: 'modifiers',
      load: () => fetchAllPages<ModifierRow>(async (offset, limit) => (await api.call<{ result: { data: ModifierRow[]; total: number } }>('GET', `/api/modifier?limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.modifierId,
      rowTitle: (r) => r.title,
      rowSubtitle: (r) => r.items.map((i) => `${i.name}${Number(i.price) > 0 ? ` +${formatMoney(i.price, 'USD')}` : ''}`).join(', '),
      searchText: (r) => `${r.title} ${r.items.map((i) => i.name).join(' ')}`,
      emptyForm: emptyModifier,
      toForm: modifierForm,
      fields: [
        { key: 'title', label: t('modifiers.title'), kind: 'text' },
        { key: 'description', label: t('modifiers.description'), kind: 'multiline' },
        { key: 'items', label: t('modifiers.items'), kind: 'multiline', hint: t('modifiers.itemsHint') },
      ],
      validate: (f) => (f.title.trim() ? null : 'title'),
      create: (f) => api.call('POST', '/api/modifier', modifierBody(f, () => Crypto.randomUUID())),
      update: (r, f) => api.call('PUT', '/api/modifier', modifierBody(f, () => Crypto.randomUUID(), r)),
      remove: (r) => api.call('DELETE', '/api/modifier', { id: r.modifierId }),
    }),
    [api, t],
  );
  return <EntityScreen config={config} />;
}

import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAllPages } from '@/lib/catalog';
import { emptySlot, slotBody, slotForm, type SlotForm, type SlotRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** A branch's stock slots (places stock is kept) like the kh-pos web Slot page. The POS slot is the one sales take stock from. */
export default function SlotsScreen() {
  const { t } = useTranslation();
  const { warehouseId } = useLocalSearchParams<{ warehouseId: string }>();
  const { api } = useSession();
  const config = useMemo<EntityConfig<SlotRow, SlotForm>>(
    () => ({
      title: t('branches.slots'),
      resource: 'slot',
      cacheKey: `slots:${warehouseId}`,
      load: () => fetchAllPages<SlotRow>(async (offset, limit) => (await api.call<{ result: { data: SlotRow[]; total: number } }>('GET', `/api/warehouse/slot?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${limit}&offset=${offset}`)).result),
      rowKey: (r) => r.id,
      rowTitle: (r) => r.name,
      rowBadge: (r) => (r.posSlot ? { text: t('branches.posSlot'), tone: 'success' } : r.forReplenishment ? { text: t('branches.replenishment'), tone: 'info' } : null),
      searchText: (r) => r.name,
      emptyForm: emptySlot,
      toForm: slotForm,
      fields: [
        { key: 'slotName', label: t('branches.slotName'), kind: 'text' },
        { key: 'forReplenishment', label: t('branches.replenishment'), kind: 'switch' },
      ],
      validate: (f) => (f.slotName.trim() ? null : 'slotName'),
      create: (f) => api.call('POST', '/api/warehouse/slot', slotBody(f, warehouseId)),
      update: (r, f) => api.call('PUT', '/api/warehouse/slot', slotBody(f, warehouseId, r)),
      remove: (r) => api.call('DELETE', '/api/warehouse/slot', { id: r.id }),
    }),
    [api, t, warehouseId],
  );
  return <EntityScreen config={config} />;
}

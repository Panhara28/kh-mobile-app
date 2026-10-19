import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { oldestFirst, variantLabel, type BacklogRow } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Orders that could not be filled from stock: resolve them once the stock is there (like the kh-pos web Backlog page). */
export default function BacklogScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const guard = useOnlineOnly();

  const config = useMemo<EntityConfig<BacklogRow, Record<string, unknown>>>(
    () => ({
      title: t('more.backlog'),
      resource: 'backlog',
      cacheKey: 'backlog',
      load: async () => oldestFirst(await fetchAllPages<BacklogRow>(async (offset, limit) => (await api.call<{ result: { data: BacklogRow[]; total: number } }>('GET', `/api/back-log-order?limit=${limit}&offset=${offset}`)).result, 100, 3)),
      rowKey: (r) => r.id,
      rowTitle: (r) => `${r.qty} × ${variantLabel(r.variant) || '-'}`,
      rowSubtitle: (r) => [r.slot?.name, r.createdBy?.fullname || r.createdBy?.username, r.createdAt].filter(Boolean).join(' · '),
      searchText: (r) => variantLabel(r.variant),
      emptyForm: () => ({}),
      toForm: () => ({}),
      fields: [],
      rowActions: (r, reload) => (
        <Button
          title={t('backlog.resolve')}
          variant="outline"
          size="sm"
          onPress={() =>
            guard(async () => {
              try {
                await api.call('POST', '/api/back-log-order/resolve', { backlogId: r.id });
                reload();
              } catch (e) {
                Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
              }
            })
          }
        />
      ),
    }),
    [api, t, guard],
  );
  return <EntityScreen config={config} />;
}

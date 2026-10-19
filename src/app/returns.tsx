import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import { formatMoney } from '@/lib/money';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { canStockIn, variantLabel, type ReturnRow } from '@/lib/stock-activity';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Button } from '@/ui/components';
import { EntityScreen, type EntityConfig } from '@/ui/entity-screen';

/** Items customers returned: put them back into stock (like the kh-pos web Return page) or see what was refunded. */
export default function ReturnsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { currency } = useBranch();
  const guard = useOnlineOnly();

  const config = useMemo<EntityConfig<ReturnRow, Record<string, unknown>>>(
    () => ({
      title: t('more.returns'),
      resource: 'order',
      cacheKey: 'returns',
      load: () => fetchAllPages<ReturnRow>(async (offset, limit) => {
        const r = (await api.call<{ result: { totalRows: number | { total: number }[]; data: ReturnRow[] } }>('GET', `/api/pos/return?limit=${limit}&offset=${offset}`)).result;
        const total = Array.isArray(r.totalRows) ? Number(r.totalRows[0]?.total ?? 0) : Number(r.totalRows ?? 0);
        return { data: r.data, total };
      }, 100, 3),
      rowKey: (r) => r.id,
      rowTitle: (r) => `${r.quantity} × ${variantLabel(r.productVariant) || '-'}`,
      rowSubtitle: (r) => [r.orderInvoiceNumber ? `#${r.orderInvoiceNumber}` : null, formatMoney(r.refundAmount, currency), r.reason, r.returnedAt].filter(Boolean).join(' · '),
      rowBadge: (r) => (canStockIn(r) ? { text: t('returns.waiting'), tone: 'warning' } : { text: t('returns.inStock'), tone: 'success' }),
      searchText: (r) => `${variantLabel(r.productVariant)} ${r.orderInvoiceNumber ?? ''}`,
      emptyForm: () => ({}),
      toForm: () => ({}),
      fields: [],
      rowActions: (r, reload) =>
        canStockIn(r) ? (
          <Button
            title={t('returns.stockIn')}
            variant="outline"
            size="sm"
            onPress={() =>
              Alert.alert(t('returns.stockInConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('returns.stockIn'),
                  onPress: () =>
                    guard(async () => {
                      try {
                        await api.call('POST', '/api/pos/return/stock-in', { id: r.id });
                        reload();
                      } catch (e) {
                        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
                      }
                    }),
                },
              ])
            }
          />
        ) : null,
    }),
    [api, t, currency, guard],
  );
  return <EntityScreen config={config} />;
}

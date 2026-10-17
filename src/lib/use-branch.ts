import { useEffect, useState } from 'react';
import { toCurrencyCode, type CurrencyCode } from './money';
import { useSession } from './session';

/** The staff member's branch id and its CURRENCY setting (USD when unset). */
export function useBranch(): { warehouseId: string; currency: CurrencyCode } {
  const { api, user } = useSession();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [currency, setCurrency] = useState<CurrencyCode>('USD');

  useEffect(() => {
    if (!warehouseId) return;
    let cancelled = false;
    api
      .settings(warehouseId)
      .then((s) => {
        if (!cancelled) setCurrency(toCurrencyCode(s.find((x) => x.option === 'CURRENCY')?.value));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, warehouseId]);

  return { warehouseId, currency };
}

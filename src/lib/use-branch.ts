import { tableModeOf, type TableMode } from './table-groups';
import { useSettingsVersion } from './use-modules';
import { useEffect, useState } from 'react';
import { toCurrencyCode, type CurrencyCode } from './money';
import { useOffline } from './offline/provider';
import { useSession } from './session';
import { exchangeRateFrom } from './payment';
import { discountCapEnabled, pickSetting } from './settings';

/**
 * The staff member's branch id, its CURRENCY (USD when unset) and whether its
 * "max quantity per line" discount cap is on (affects adding the same dish again).
 */
export function useBranch(): { warehouseId: string; currency: CurrencyCode; capEnabled: boolean; exchangeRate: number; tableMode: TableMode; tagCount: number } {
  const { user } = useSession();
  const { data, state } = useOffline();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [capEnabled, setCapEnabled] = useState(true);
  const [exchangeRate, setExchangeRate] = useState(exchangeRateFrom(null));
  const [tableMode, setTableMode] = useState<TableMode>('NORMAL');
  const [tagCount, setTagCount] = useState(50);
  const version = useSettingsVersion();

  useEffect(() => {
    if (!warehouseId) return;
    let cancelled = false;
    // Saved settings are used when kh-pos can't be reached, so the currency stays right offline.
    data
      .settings(warehouseId)
      .then(({ data: s }) => {
        if (cancelled) return;
        setCurrency(toCurrencyCode(pickSetting(s, 'CURRENCY', warehouseId)));
        setCapEnabled(discountCapEnabled(pickSetting(s, 'ORDER_DISCOUNT_RULES', warehouseId)));
        setExchangeRate(exchangeRateFrom(pickSetting(s, 'EXCHANGE_RATE', warehouseId)));
        const tm = tableModeOf(s, warehouseId);
        setTableMode(tm.mode);
        setTagCount(tm.tagCount);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data, warehouseId, state.online, version]);

  return { warehouseId, currency, capEnabled, exchangeRate, tableMode, tagCount };
}

import { useCallback, useEffect, useState } from 'react';
import { useOffline } from '@/lib/offline/provider';
import { useSession } from '@/lib/session';
import type { SettingRow } from '@/lib/settings-admin';

/**
 * The setting rows the web Settings dialog lists: the ones every branch shares plus this branch's own
 * (kh-pos answers with the signed-in branch's rows). Kept for offline reading.
 */
export function useSettingRows() {
  const { api, user } = useSession();
  const { data } = useOffline();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [stale, setStale] = useState<number | null | false>(false);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      const r = await data.cachedRead('settings-general', warehouseId, async () => (await api.call<{ result?: SettingRow[] }>('GET', `/api/setting?warehouseId=${encodeURIComponent(warehouseId)}`)).result ?? []);
      setRows(r.data);
      setStale(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, data, warehouseId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { rows, stale, error, reload };
}

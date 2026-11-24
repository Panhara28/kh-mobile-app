import { useEffect, useMemo, useState } from 'react';
import type { Setting } from './api';
import { visibleModules } from './modules';
import { useOffline } from './offline/provider';
import { useSession } from './session';
import { pickSetting } from './settings';

/**
 * The modules this staff member sees: their role's permissions, the branch's optional modules, and the
 * store's business type / edition (a small restaurant sees only the basics, like on the web).
 * Uses the saved settings when kh-pos can't be reached.
 */
export function useModules() {
  const { user } = useSession();
  const { data, state } = useOffline();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [settings, setSettings] = useState<Setting[]>([]);
  useEffect(() => {
    let cancelled = false;
    data.settings(warehouseId).then(
      ({ data: s }) => {
        if (!cancelled) setSettings(s);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [data, warehouseId, state.online]);
  return useMemo(() => visibleModules(user, (option) => pickSetting(settings, option, warehouseId)), [user, settings, warehouseId]);
}

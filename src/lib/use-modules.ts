import { useEffect, useMemo, useState } from 'react';
import type { Setting } from './api';
import { storeKind, type StoreKind } from './business-type';
import { visibleModules } from './modules';
import { useOffline } from './offline/provider';
import { useSession } from './session';
import { pickSetting } from './settings';

/** The branch's settings (the saved copy when kh-pos can't be reached); null until loaded. */
function useBranchSettings(): Setting[] | null {
  const { user } = useSession();
  const { data, state } = useOffline();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [settings, setSettings] = useState<Setting[] | null>(null);
  useEffect(() => {
    if (!user) return;
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
  }, [data, user, warehouseId, state.online]);
  return settings;
}

/**
 * The modules this staff member sees: their role's permissions, the branch's optional modules, and the
 * store's business type / edition (a small restaurant sees only the basics, like on the web).
 */
export function useModules() {
  const { user } = useSession();
  const settings = useBranchSettings();
  const warehouseId = user?.currentWarehouseId ?? '';
  return useMemo(() => visibleModules(user, (option) => pickSetting(settings ?? [], option, warehouseId)), [user, settings, warehouseId]);
}

/** The store's business type and edition (TYPE_POS); unknown (nothing hidden) until the settings load. */
export function useStoreKind(): StoreKind {
  const { user } = useSession();
  const settings = useBranchSettings();
  const warehouseId = user?.currentWarehouseId ?? '';
  return useMemo(() => storeKind(settings ? pickSetting(settings, 'TYPE_POS', warehouseId) : null), [settings, warehouseId]);
}

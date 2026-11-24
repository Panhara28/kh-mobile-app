import { useCallback, useMemo, useState } from 'react';
import type { Shift } from './api';
import { useOffline } from './offline/provider';
import { useSession } from './session';
import { applyShiftCommands } from './shift';

/**
 * The shift the staff member works in, like the web (GET /api/shift/current): their own open shift, otherwise the
 * branch's (one shift per branch, whoever opened it). From kh-pos, or the saved copy when it can't be reached, with
 * opening or closing done offline applied. `reload` reads again (when a screen is shown and after changes).
 */
export function useShift() {
  const { user } = useSession();
  const { data, state } = useOffline();
  const [current, setCurrent] = useState<Shift | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const uid = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setCurrent((await data.currentShift(uid)).data);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, uid]);

  const shift = useMemo(
    () => (current !== undefined && user ? applyShiftCommands(current, state.commands, user) : null),
    [current, user, state.commands],
  );

  return { shift, loaded: current !== undefined, error, reload };
}

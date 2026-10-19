import { useCallback, useMemo, useState } from 'react';
import type { Shift } from './api';
import { useOffline } from './offline/provider';
import { useSession } from './session';
import { applyShiftCommands, currentShift } from './shift';

/**
 * The cashier's shifts: from kh-pos, or the saved copy when it can't be reached, with opening or
 * closing done offline applied. `reload` reads again (call it when a screen is shown and after
 * changes were sent).
 */
export function useShift() {
  const { user } = useSession();
  const { data, state } = useOffline();
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const uid = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setShifts((await data.shifts(uid)).data.data);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, uid]);

  const shift = useMemo(
    () => (shifts && user ? applyShiftCommands(currentShift(shifts, user.id), state.commands, user) : null),
    [shifts, user, state.commands],
  );
  /** Closed shifts, newest first. */
  const history = useMemo(() => (shifts ?? []).filter((s) => s.status === 'CLOSE'), [shifts]);

  return { shift, history, loaded: shifts !== null, error, reload };
}

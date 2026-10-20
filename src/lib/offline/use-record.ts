import * as Crypto from 'expo-crypto';
import { useCallback, useMemo } from 'react';
import { useSession } from '../session';
import { useOffline } from './provider';
import { overlayRecords, recordCommand, type RecordRequest, type WithSyncFlag } from './records';

/**
 * Saves a setup change (add, edit, delete): sent at once when kh-pos is reachable, otherwise kept on the phone and
 * sent later, in order. Resolves 'done' or 'queued'. When kh-pos refuses the change while online the error is thrown
 * to the caller, as for any other save.
 */
export function useRecordWriter() {
  const { api, user } = useSession();
  const { engine } = useOffline();
  return useCallback(
    (req: RecordRequest): Promise<'done' | 'queued'> => {
      const cmd = recordCommand(user?.id ?? '', req, Crypto.randomUUID());
      return engine.run(cmd, async () => void (await api.call(req.method, req.path, req.body)));
    },
    [api, engine, user?.id],
  );
}

/** The list with the waiting changes of this entity applied (marked `pendingSync` / `syncFailed`). */
export function useRecordRows<T extends object>(rows: T[] | null, entity: string, idOf: (row: T) => string): WithSyncFlag<T>[] | null {
  const { state } = useOffline();
  return useMemo(() => (rows ? overlayRecords(rows, state.commands, entity, idOf) : null), [rows, state.commands, entity, idOf]);
}

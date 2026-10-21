import * as Crypto from 'expo-crypto';
import { useCallback, useMemo } from 'react';
import { planAndProduce } from '../production';
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
      const send = async () => {
        if (req.produce) {
          await planAndProduce((method, path, body) => api.call(method, path, body), req.produce);
          return;
        }
        // the several calls of one change, one after the other
        for (const step of req.steps && req.steps.length > 0 ? req.steps : [{ method: req.method, path: req.path, body: req.body }]) {
          const answer = (await api.call(step.method, step.path, step.body)) as Record<string, unknown> | undefined;
          if (req.mustBeTrue && answer && answer[req.mustBeTrue] === false) throw new Error('kh-pos did not accept it');
        }
      };
      return req.once ? engine.runOnce(cmd, send) : engine.run(cmd, send);
    },
    [api, engine, user?.id],
  );
}

/** The list with the waiting changes of this entity applied (marked `pendingSync` / `syncFailed`). */
export function useRecordRows<T extends object>(rows: T[] | null, entity: string, idOf: (row: T) => string): WithSyncFlag<T>[] | null {
  const { state } = useOffline();
  return useMemo(() => (rows ? overlayRecords(rows, state.commands, entity, idOf) : null), [rows, state.commands, entity, idOf]);
}

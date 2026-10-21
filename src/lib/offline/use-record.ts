import * as Crypto from 'expo-crypto';
import { useCallback, useMemo } from 'react';
import { planAndProduce } from '../production';
import { resultOf, withResult } from './steps';
import { useSession } from '../session';
import { useOffline } from './provider';
import { phoneSecretBox } from './phone-secret';
import { overlayRecords, recordCommand, type RecordRequest, type WithSyncFlag } from './records';

/**
 * Saves a setup change (add, edit, delete): sent at once when kh-pos is reachable, otherwise kept on the phone and
 * sent later, in order. Resolves 'done' or 'queued'. When kh-pos refuses the change while online the error is thrown
 * to the caller, as for any other save. `onAnswer` gets kh-pos' answer to the last call when it was sent at once.
 */
export function useRecordWriter() {
  const { api, user } = useSession();
  const { engine } = useOffline();
  return useCallback(
    async (req: RecordRequest, onAnswer?: (answer: Record<string, unknown> | undefined) => void): Promise<'done' | 'queued'> => {
      // a body with a password is sealed before it is written to the phone's database
      const sealed = req.secret ? await phoneSecretBox.seal(JSON.stringify({ body: req.body, steps: req.steps })) : undefined;
      const cmd = recordCommand(user?.id ?? '', req, Crypto.randomUUID(), Date.now(), sealed);
      let lastAnswer: Record<string, unknown> | undefined;
      const send = async () => {
        if (req.produce) {
          await planAndProduce((method, path, body) => api.call(method, path, body), req.produce);
          return;
        }
        // the several calls of one change, one after the other (a later call may use the `result` of the one before)
        let resultId: string | undefined;
        for (const raw of req.steps && req.steps.length > 0 ? req.steps : [{ method: req.method, path: req.path, body: req.body }]) {
          const step = await engine.resolveUploads(withResult(raw, resultId));
          const answer = (await api.call(step.method, step.path, step.body)) as Record<string, unknown> | undefined;
          if (req.mustBeTrue && answer && answer[req.mustBeTrue] === false) throw new Error('kh-pos did not accept it');
          resultId = resultOf(answer) ?? resultId;
          lastAnswer = answer;
        }
      };
      const how = await (req.once ? engine.runOnce(cmd, send) : engine.run(cmd, send));
      // what kh-pos answered, when the change was sent at once (a form that picks the new record needs its id)
      if (how === 'done') onAnswer?.(lastAnswer);
      return how;
    },
    [api, engine, user?.id],
  );
}

/** The list with the waiting changes of this entity applied (marked `pendingSync` / `syncFailed`). */
export function useRecordRows<T extends object>(rows: T[] | null, entity: string, idOf: (row: T) => string): WithSyncFlag<T>[] | null {
  const { state } = useOffline();
  return useMemo(() => (rows ? overlayRecords(rows, state.commands, entity, idOf) : null), [rows, state.commands, entity, idOf]);
}

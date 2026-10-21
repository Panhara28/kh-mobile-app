import type { NewCommand, OutboxCommand, RecordPayload } from './types';

/**
 * Setup screens (categories, suppliers, settings ...) save a change as a "record" command: the request to send,
 * plus the record as it should look on screen. While kh-pos can't be reached the change waits in the outbox and
 * these helpers show it on the list at once; kh-pos stays the source of truth when it is replayed.
 */

export interface RecordRequest {
  entity: string;
  op: RecordPayload['op'];
  recordId: string;
  method: RecordPayload['method'];
  path: string;
  body?: unknown;
  steps?: RecordPayload['steps'];
  mustBeTrue?: string;
  produce?: RecordPayload['produce'];
  label: string;
  once?: boolean;
  row?: Record<string, unknown>;
  /** The body carries a secret (a password): it is sealed before it is written to the phone's database. */
  secret?: boolean;
}

/** The outbox entry for a setup change. */
export function recordCommand(userId: string, req: RecordRequest, id: string, now = Date.now(), sealed?: string): NewCommand<'record'> {
  return {
    id,
    userId,
    kind: 'record',
    tableId: `record:${req.entity}`,
    createdAt: now,
    payload: { entity: req.entity, op: req.op, recordId: req.recordId, method: req.method, path: req.path, body: sealed ? undefined : req.body, steps: sealed ? undefined : req.steps, sealed, mustBeTrue: req.mustBeTrue, produce: req.produce, label: req.label, once: req.once, row: req.row },
  };
}

const isRecord = (c: OutboxCommand, entity: string): c is OutboxCommand<'record'> => c.kind === 'record' && (c.payload as RecordPayload).entity === entity;

/** The waiting changes of one list, oldest first. */
export const recordCommands = (commands: OutboxCommand[], entity: string) => commands.filter((c): c is OutboxCommand<'record'> => isRecord(c, entity));

export type WithSyncFlag<T> = T & { pendingSync?: boolean; syncFailed?: boolean };

/**
 * The list as it will be once the waiting changes are sent: an added record appears (marked), an edited one shows its
 * new values (marked), a deleted one disappears. Failed changes stay shown, marked failed, so they are not forgotten.
 */
export function overlayRecords<T extends object>(rows: T[], commands: OutboxCommand[], entity: string, idOf: (row: T) => string): WithSyncFlag<T>[] {
  let out: WithSyncFlag<T>[] = rows.map((r) => ({ ...r }));
  for (const c of recordCommands(commands, entity)) {
    const p = c.payload;
    const failed = c.status === 'failed';
    if (p.op === 'delete') {
      out = out.filter((r) => idOf(r) !== p.recordId);
    } else if (p.op === 'update' || (p.op === 'action' && p.row)) {
      out = out.map((r) => (idOf(r) === p.recordId ? { ...r, ...(p.row as Partial<T>), pendingSync: true, syncFailed: failed } : r));
    } else if (p.op === 'create' && p.row && !out.some((r) => idOf(r) === p.recordId)) {
      out = [...out, { ...(p.row as T), pendingSync: true, syncFailed: failed }];
    }
  }
  return out;
}

/** A record that is only waiting to be added can't be edited yet (its id is not on kh-pos). */
export const isUnsent = (row: { pendingSync?: boolean }, commands: OutboxCommand[], entity: string, recordId: string) =>
  !!row.pendingSync && recordCommands(commands, entity).some((c) => c.payload.op === 'create' && c.payload.recordId === recordId);

/** A change to this record is already waiting (so the same action is not done twice before it is sent). */
export const hasPending = (commands: OutboxCommand[], entity: string, recordId: string) =>
  recordCommands(commands, entity).some((c) => c.payload.recordId === recordId && c.status === 'pending');

/** How many changes of these lists are waiting (pending or failed), for a small note on a screen. */
export const waitingCount = (commands: OutboxCommand[], entities: string[]) =>
  commands.filter((c) => c.kind === 'record' && entities.includes((c.payload as RecordPayload).entity)).length;

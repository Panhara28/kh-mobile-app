/**
 * Settings > General > Type POS > "Clean up dummy data" (web `type-pos.tsx`, `POST /api/setting/clean`): deletes the
 * orders, order lines, payments, shifts and kitchen logs that were made in testing mode (`is_testing = 1`) at the
 * current branch. kh-pos answers with a stream of lines `data: {"status","progress","message"}` that the screen shows.
 */

export type CleanStatus = 'running' | 'completed' | 'failed';

export interface CleanEvent {
  status: CleanStatus;
  /** 0 to 100 */
  progress: number;
  message: string;
}

const STATUSES: CleanStatus[] = ['running', 'completed', 'failed'];

/**
 * Takes the text received so far and returns the complete events in it plus the unfinished tail to keep for the next
 * piece. Events end with a blank line; text that is not an event is skipped.
 */
export function parseCleanEvents(buffer: string): { events: CleanEvent[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const events: CleanEvent[] = [];
  for (const part of parts) {
    const line = part
      .split('\n')
      .find((l) => l.startsWith('data:'));
    if (!line) continue;
    try {
      const v = JSON.parse(line.slice(5).trim()) as Partial<CleanEvent>;
      if (v && STATUSES.includes(v.status as CleanStatus)) {
        events.push({ status: v.status as CleanStatus, progress: Math.max(0, Math.min(100, Number(v.progress) || 0)), message: String(v.message ?? '') });
      }
    } catch {
      // not an event
    }
  }
  return { events, rest };
}

export interface CleanState {
  status: CleanStatus | 'idle';
  progress: number;
  message: string;
  logs: string[];
}

export const CLEAN_IDLE: CleanState = { status: 'idle', progress: 0, message: '', logs: [] };

/** The screen state after one more event (the log keeps every message once, in order). */
export function applyCleanEvent(state: CleanState, e: CleanEvent): CleanState {
  const last = state.logs[state.logs.length - 1];
  return { status: e.status, progress: e.progress, message: e.message, logs: e.message && e.message !== last ? [...state.logs, e.message] : state.logs };
}

/** The stream ended without a final event, or broke: the run did not finish (kh-pos works in one transaction, so nothing was half-deleted). */
export function applyCleanEnd(state: CleanState): CleanState {
  return state.status === 'completed' || state.status === 'failed' ? state : { ...state, status: 'failed', message: 'Pipeline disconnected unexpectedly.', logs: [...state.logs, 'Pipeline disconnected unexpectedly.'] };
}

/**
 * A change with several calls may need what an earlier call answered (a new replenishment's id for the call that sets its
 * picking list). Put `{{result}}` in the later call's path or body; it is replaced by the `result` of the call before.
 */
export const RESULT_MARK = '{{result}}';

export interface Step {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

export function withResult(step: Step, resultId: string | undefined): Step {
  if (!resultId) return step;
  const text = JSON.stringify(step.body ?? null);
  return {
    ...step,
    path: step.path.split(RESULT_MARK).join(encodeURIComponent(resultId)),
    body: step.body === undefined ? undefined : JSON.parse(text.split(RESULT_MARK).join(resultId)),
  };
}

/** The id an answer carries as `result`, when it is a plain string. */
export const resultOf = (answer: unknown): string | undefined => {
  const r = (answer as { result?: unknown } | null | undefined)?.result;
  return typeof r === 'string' && r ? r : undefined;
};

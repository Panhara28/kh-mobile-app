/** The Payment Method page of the kh-pos web app (Settings > Payment): a list of method names that cashiers pick at checkout. */

export interface MethodItem {
  method_id: string;
  method: string | null;
  created_at?: string | null;
}

export interface MethodRow extends MethodItem {
  /** Its place in the list, shown as "#" like the web table. */
  no: number;
}

export type MethodForm = { method: string };

export const emptyMethodForm = (): MethodForm => ({ method: '' });
export const methodFormOf = (m: MethodItem): MethodForm => ({ method: m.method ?? '' });

/** The web saves any text; an empty name would make an unusable checkout button, so the phone needs one. */
export const methodProblem = (f: MethodForm): 'method' | null => (f.method.trim() ? null : 'method');

/** POST for a new method, PUT with the id for an edit. */
export const methodBody = (f: MethodForm, existing?: MethodItem) => ({ ...(existing ? { id: existing.method_id } : {}), method: f.method.trim() });

/** The list, numbered from 1 in the order the server sends it. */
export const numbered = (items: MethodItem[]): MethodRow[] => items.map((m, i) => ({ ...m, no: i + 1 }));

/** "2026-10-20 09:15" from the stored time, or nothing. */
export const createdText = (m: Pick<MethodItem, 'created_at'>) => (m.created_at ? m.created_at.replace('T', ' ').slice(0, 16) : '');

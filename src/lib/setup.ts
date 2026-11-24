/**
 * First-time store setup, like the kh-pos web /admin/setup (GET/PUT/POST /api/setup). Until it is finished kh-pos
 * refuses to open a shift or sell ("Finish the store setup before selling."), so the phone leads the owner through it.
 */
export type SetupStepKey = 'store' | 'type' | 'currency' | 'payment' | 'printers' | 'tables' | 'halls';
export type SetupSystemType = 'MART' | 'RESTAURANT' | 'CINEMA';

export interface SetupStatus {
  complete: boolean;
  systemType: SetupSystemType | '';
  edition: 'FULL' | 'LITE';
  steps: { key: SetupStepKey; done: boolean; count?: number }[];
  store: { name: string; phone: string; address: string; logo: string };
  currency: string;
  exchangeRate: number;
  tableMode: 'NORMAL' | 'TAG';
  tagCount: number;
}

/** A kitchen printer as kh-pos keeps it (GET /api/printer). */
export interface SetupPrinter {
  id: string;
  name: string;
  printerName: string;
  ip: string;
  port: number | string;
}

/** The step to show: the first one not done yet, else the finish page. */
export function firstOpenStep(status: Pick<SetupStatus, 'steps'>): SetupStepKey | 'finish' {
  return status.steps.find((s) => !s.done)?.key ?? 'finish';
}

/** The step after `key` once it was saved (from the fresh status): the next one, or finish when all are done. */
export function nextStep(status: Pick<SetupStatus, 'steps'>, key: SetupStepKey): SetupStepKey | 'finish' {
  const at = status.steps.findIndex((s) => s.key === key);
  const next = status.steps[at + 1]?.key;
  if (next) return next;
  return status.steps.every((s) => s.done) ? 'finish' : firstOpenStep(status);
}

/** The business choice shown to the owner, and what kh-pos stores for it. */
export type BusinessChoice = 'SMALL_RESTAURANT' | 'RESTAURANT' | 'MART' | 'CINEMA';
export function choiceOf(status: Pick<SetupStatus, 'systemType' | 'edition'>): BusinessChoice | null {
  if (status.systemType === 'RESTAURANT') return status.edition === 'LITE' ? 'SMALL_RESTAURANT' : 'RESTAURANT';
  return status.systemType || null;
}
export function typeBody(choice: BusinessChoice) {
  if (choice === 'SMALL_RESTAURANT') return { step: 'type' as const, systemType: 'RESTAURANT' as const, edition: 'LITE' as const };
  if (choice === 'RESTAURANT') return { step: 'type' as const, systemType: 'RESTAURANT' as const, edition: 'FULL' as const };
  return { step: 'type' as const, systemType: choice };
}

/** Why the printers step can't be saved, or null (kh-pos needs a name, an address and a port for each). */
export function printerProblem(printers: SetupPrinter[]): 'none' | 'name' | 'ip' | 'port' | null {
  if (printers.length === 0) return 'none';
  for (const p of printers) {
    if (!p.name.trim()) return 'name';
    if (!p.ip.trim()) return 'ip';
    const port = Number(p.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'port';
  }
  return null;
}

/** The printers step as kh-pos wants it: every printer, and the printer each category for sale prints to. */
export function printersBody(printers: SetupPrinter[], categories: { id: string; printerId: string }[]) {
  return {
    step: 'printers' as const,
    printers: printers.map((p) => ({ id: p.id, name: p.name.trim(), printerName: p.printerName.trim() || p.name.trim(), ip: p.ip.trim(), port: Number(p.port) })),
    categories: categories.map((c) => ({ categoryId: c.id, printerId: printers.some((p) => p.id === c.printerId) ? c.printerId : (printers[0]?.id ?? '') })),
  };
}

// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/** True when the database refused a duplicate value of `column` (a Prisma or raw libSQL error). */
export function isUniqueError(e: unknown, column: string): boolean {
  const err = e as { code?: string; message?: string; meta?: unknown } | null;
  const text = `${err?.message ?? ""} ${JSON.stringify(err?.meta ?? "")}`;
  return (err?.code === "P2002" || /unique/i.test(text)) && text.includes(column);
}

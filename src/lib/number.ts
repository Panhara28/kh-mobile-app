/** A typed whole number, kept within [min, max]; the fallback is used when nothing valid was typed. */
export function clampInt(text: string, min: number, max: number, fallback: number): number {
  const n = parseInt(text, 10);
  if (Number.isNaN(n)) return Math.max(min, Math.min(max, fallback));
  return Math.max(min, Math.min(max, n));
}

import type { Setting } from './api';

/** A setting for the branch: its own row first, then the global one (warehouse null), like kh-pos. */
export function pickSetting(settings: (Setting & { warehouse?: string | null })[], option: string, warehouseId: string): string | null {
  const rows = settings.filter((s) => s.option === option);
  return (rows.find((s) => s.warehouse === warehouseId) ?? rows.find((s) => !s.warehouse) ?? rows[0])?.value ?? null;
}

/**
 * ORDER_DISCOUNT_RULES "max quantity per line" (kh-pos src/lib/order-discount-rules.ts).
 * kh-pos treats a missing setting as enabled (value 3), so the app does too.
 */
export function discountCapEnabled(value: string | null): boolean {
  if (!value) return true;
  try {
    const rule = (JSON.parse(value) as { maxQtyPerLine?: { enabled?: unknown; value?: unknown } }).maxQtyPerLine;
    if (!rule) return true;
    return rule.enabled !== false && Number(rule.value ?? 3) > 0;
  } catch {
    return true;
  }
}

/** Editing kh-pos settings (the `setting` table: option name and a text value, per branch or for everyone). */

export interface SettingRow {
  id: number;
  option: string | null;
  value: string | null;
  /** Branch id, or null for the setting every branch shares. */
  warehouse: string | null;
}

export type SettingKind = 'currency' | 'number' | 'json' | 'text';

const CURRENCY_OPTIONS = ['USD', 'KHR', 'EUR', 'GBP'];
export const currencyOptions = () => CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }));

/** How a setting is edited: a currency picker, a number box, JSON (when it is JSON now), or text. */
export function settingKind(option: string | null | undefined, value: string | null | undefined): SettingKind {
  if (option === 'CURRENCY') return 'currency';
  if (option === 'EXCHANGE_RATE') return 'number';
  const v = (value ?? '').trim();
  if (v.startsWith('{') || v.startsWith('[')) {
    try {
      JSON.parse(v);
      return 'json';
    } catch {
      return 'text';
    }
  }
  return 'text';
}

/** Whether the typed value may be saved for that kind of setting; returns the text to save, or null if it is not valid. */
export function cleanSettingValue(kind: SettingKind, value: string): string | null {
  const v = value.trim();
  switch (kind) {
    case 'currency':
      return CURRENCY_OPTIONS.includes(v) ? v : null;
    case 'number': {
      const n = Number(v.replace(/,/g, ''));
      return Number.isFinite(n) && n > 0 ? String(n) : null;
    }
    case 'json':
      try {
        return JSON.stringify(JSON.parse(v));
      } catch {
        return null;
      }
    default:
      return value;
  }
}

/** JSON settings are shown indented so they can be read and edited. */
export function displayValue(kind: SettingKind, value: string | null | undefined): string {
  const v = value ?? '';
  if (kind !== 'json') return v;
  try {
    return JSON.stringify(JSON.parse(v), null, 2);
  } catch {
    return v;
  }
}

/** A short one-line preview for the list. */
export function previewValue(value: string | null | undefined, max = 80): string {
  const one = (value ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** "ORDER_DISCOUNT_RULES" → "Order discount rules". */
export function optionLabel(option: string | null | undefined): string {
  const words = (option ?? '').toLowerCase().split('_').filter(Boolean);
  if (words.length === 0) return '';
  return [words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1), ...words.slice(1)].join(' ');
}

/** The settings for this branch: its own rows win over the shared one with the same option. */
export function effectiveSettings(rows: SettingRow[], warehouseId: string): SettingRow[] {
  const byOption = new Map<string, SettingRow>();
  for (const r of rows) {
    if (!r.option) continue;
    if (r.warehouse && r.warehouse !== warehouseId) continue;
    const have = byOption.get(r.option);
    if (!have || (r.warehouse && !have.warehouse)) byOption.set(r.option, r);
  }
  return [...byOption.values()].sort((a, b) => (a.option ?? '').localeCompare(b.option ?? ''));
}

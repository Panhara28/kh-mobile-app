/** Cinema pricing templates like the kh-pos web page: a name, when it applies, and the extra price of each seat type. */

const n = (v: unknown) => Number(v) || 0;

export type TimeSlot = 'matinee' | 'evening' | 'late_night' | 'all_day';
export type DayType = 'weekday' | 'weekend' | 'holiday' | 'all_days';
export const TIME_SLOTS: TimeSlot[] = ['matinee', 'evening', 'late_night', 'all_day'];
export const DAY_TYPES: DayType[] = ['weekday', 'weekend', 'holiday', 'all_days'];

/** The seat types kh-pos prices (its defaults: standard 0, wheelchair 0, vip 2, couple 3). */
export const SEAT_TYPES = ['standard', 'wheelchair', 'vip', 'couple'] as const;

export interface TemplateRow {
  template_id: string;
  template_name: string;
  time_slot: TimeSlot;
  day_type: DayType;
  extra_seat_prices: Record<string, number> | null;
}

export type TemplateForm = {
  name: string;
  timeSlot: TimeSlot;
  dayType: DayType;
  standard: number;
  wheelchair: number;
  vip: number;
  couple: number;
};

export const emptyTemplate = (): TemplateForm => ({ name: '', timeSlot: 'all_day', dayType: 'all_days', standard: 0, wheelchair: 0, vip: 2, couple: 3 });

export const templateForm = (r: TemplateRow): TemplateForm => ({
  name: r.template_name,
  timeSlot: r.time_slot,
  dayType: r.day_type,
  standard: n(r.extra_seat_prices?.standard),
  wheelchair: n(r.extra_seat_prices?.wheelchair),
  vip: n(r.extra_seat_prices?.vip),
  couple: n(r.extra_seat_prices?.couple),
});

export function validateTemplate(f: TemplateForm): keyof TemplateForm | null {
  if (!f.name.trim()) return 'name';
  for (const s of SEAT_TYPES) if (n(f[s]) < 0) return s;
  return null;
}

/**
 * The body kh-pos wants. Seat types it does not edit here (the web page lets staff add others)
 * are kept as they were, so editing on the phone never drops them.
 */
export function templateBody(f: TemplateForm, existing?: TemplateRow) {
  const prices: Record<string, number> = { ...(existing?.extra_seat_prices ?? {}) };
  for (const s of SEAT_TYPES) prices[s] = n(f[s]);
  return { ...(existing ? { id: existing.template_id } : {}), template_name: f.name.trim(), time_slot: f.timeSlot, day_type: f.dayType, extra_seat_prices: prices };
}

/** "vip +2, couple +3": only the seat types that cost extra. */
export function extrasText(r: Pick<TemplateRow, 'extra_seat_prices'>): string {
  return Object.entries(r.extra_seat_prices ?? {})
    .filter(([, v]) => n(v) > 0)
    .map(([k, v]) => `${k} +${n(v)}`)
    .join(', ');
}

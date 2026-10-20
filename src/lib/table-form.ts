import type { RestaurantTable, Setting, TableInput } from './api';
import { pickSetting } from './settings';

export interface Option {
  value: string;
  label: string;
}

/** A setting that holds a JSON list of { value, label } (TABLE_SELECTION, TABLE_SHAPE); empty when unset or broken. */
export function optionList(value: string | null | undefined): Option[] {
  if (!value) return [];
  try {
    const list = JSON.parse(value) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => (x && typeof x === 'object' ? (x as { value?: unknown; label?: unknown }) : null))
      .filter((x): x is { value: string; label?: string } => !!x && typeof x.value === 'string' && x.value.length > 0)
      .map((x) => ({ value: x.value, label: typeof x.label === 'string' && x.label ? x.label : x.value }));
  } catch {
    return [];
  }
}

export function tableOptions(settings: Setting[], warehouseId: string) {
  return {
    sections: optionList(pickSetting(settings, 'TABLE_SELECTION', warehouseId)),
    shapes: optionList(pickSetting(settings, 'TABLE_SHAPE', warehouseId)),
  };
}

export const emptyTableForm = (): TableInput => ({ tableNumber: '', seatingCapacity: 4, section: '', tableShape: '', locationDescription: '', features: [], additionalNotes: '' });

/** The form filled from an existing table (features are saved by kh-pos as "a, b, c"). */
export function formFromTable(t: RestaurantTable): TableInput {
  return {
    tableNumber: t.table_name,
    seatingCapacity: t.setting_capacity ?? 1,
    section: t.section ?? '',
    tableShape: t.table_shape ?? '',
    locationDescription: t.location_description ?? '',
    features: (t.special_features ?? '').split(',').map((f) => f.trim()).filter(Boolean),
    additionalNotes: t.addional_notes ?? '',
  };
}

/** The same required fields as the kh-pos form and API: name, capacity, section and shape. */
export function validateTable(f: TableInput): string | null {
  if (!f.tableNumber.trim()) return 'tableNumber';
  if (!(f.seatingCapacity >= 1)) return 'seatingCapacity';
  if (!f.section.trim()) return 'section';
  if (!f.tableShape.trim()) return 'tableShape';
  return null;
}

export function cleanTable(f: TableInput): TableInput {
  return {
    tableNumber: f.tableNumber.trim(),
    seatingCapacity: Math.max(1, Math.floor(f.seatingCapacity)),
    section: f.section.trim(),
    tableShape: f.tableShape.trim(),
    locationDescription: f.locationDescription?.trim() ?? '',
    features: f.features.map((x) => x.trim()).filter(Boolean),
    additionalNotes: f.additionalNotes?.trim() ?? '',
  };
}

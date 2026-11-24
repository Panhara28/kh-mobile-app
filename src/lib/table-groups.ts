import type { RestaurantTable, Setting, TableOrder } from './api';
import { pickSetting } from './settings';

/**
 * "Table + Tag" style (kh-pos-v2): several groups of guests share one table, and each group has its
 * own order with a tag number (001, 002, ...). kh-pos-v2 refuses a table order without a tag in this
 * style, and its single-table call only returns the table's first order.
 *
 * On the phone each group is its own "seat" with the id `<tableId>~<orderId>`. The order id is made on
 * the phone before the order exists, so a group started offline becomes exactly that order when it is
 * sent, and every screen, saved change and retry keeps working with one id per order, as for a plain table.
 */
export type TableMode = 'NORMAL' | 'TAG';

const SEP = '~';
const DEFAULT_TAG_COUNT = 50;
const MAX_TAG_COUNT = 999;

export const seatId = (tableId: string, orderId: string) => `${tableId}${SEP}${orderId}`;

/** The real table and, for a group seat, its order id. */
export function splitSeat(id: string): { tableId: string; orderId: string | null } {
  const i = id.indexOf(SEP);
  return i < 0 ? { tableId: id, orderId: null } : { tableId: id.slice(0, i), orderId: id.slice(i + 1) || null };
}

export const isGroupSeat = (id: string) => splitSeat(id).orderId !== null;

/** The branch's table style, from the TYPE_POS setting (same rules as kh-pos-v2 classes/table-mode.ts). */
export function tableModeOf(settings: Setting[], warehouseId: string): { mode: TableMode; tagCount: number } {
  try {
    const v = JSON.parse(pickSetting(settings, 'TYPE_POS', warehouseId) || '{}');
    const count = Number(v.tag_count);
    return {
      mode: v.system_type === 'RESTAURANT' && v.table_mode === 'TAG' ? 'TAG' : 'NORMAL',
      tagCount: Number.isInteger(count) && count > 0 ? Math.min(count, MAX_TAG_COUNT) : DEFAULT_TAG_COUNT,
    };
  } catch {
    return { mode: 'NORMAL', tagCount: DEFAULT_TAG_COUNT };
  }
}

/** "5" -> "005", as kh-pos stores tags. */
export const formatTag = (n: number) => String(n).padStart(3, '0');

/** The open groups at a table (kh-pos-v2 sends them as `orders`; older servers only `order`). */
export function openGroups(table: RestaurantTable): TableOrder[] {
  if (table.orders?.length) return table.orders;
  return table.order ? [table.order] : [];
}

/** Tags held by open orders anywhere in the branch. */
export function usedTags(tables: RestaurantTable[]): Set<string> {
  const used = new Set<string>();
  for (const t of tables) for (const o of openGroups(t)) if (o.tagNo) used.add(o.tagNo);
  return used;
}

/** The smallest free tag ("1", "2", ...), skipping `also` (tags refused just now); '' when all are taken. */
export function lowestFreeTag(used: Set<string>, tagCount: number, also: Set<string> = new Set()): string {
  for (let n = 1; n <= tagCount; n++) {
    const tag = formatTag(n);
    if (!used.has(tag) && !also.has(tag)) return String(n);
  }
  return '';
}

/** One group of a table as its own seat: the table with just that group's order (none yet for a new group). */
export function groupSeat(table: RestaurantTable, orderId: string): RestaurantTable {
  const order = openGroups(table).find((o) => o.orderId === orderId) ?? null;
  return { ...table, id: seatId(table.id, orderId), order, orders: order ? [order] : [] };
}

/** Every seat id at this table that has changes waiting on the phone (groups started offline included). */
export function waitingSeats(tableId: string, commandTableIds: string[]): string[] {
  const prefix = `${tableId}${SEP}`;
  return [...new Set(commandTableIds.filter((id) => id.startsWith(prefix)))];
}

/**
 * Finding & Transfer like the kh-pos web page (Order Management > Finding and Transfer): for a draft
 * order, look for its products in the non-POS slots and move them to the POS slot for checkout,
 * or convert (break down / repack) other variants into the one the order needs.
 */

const n = (v: unknown) => Number(v) || 0;

export const PAGE = 30;

/** One draft order of the list (GET /api/pos/order?status=DRAFT). */
export interface DraftOrder {
  orderId: string;
  invoiceNo: number | string;
  createdAt?: string | null;
  totalAmount: string;
  transferBy?: { fullname?: string | null } | null;
  items?: { variantId: string; qty: number }[];
}

/** The list query: the first 30 drafts, optionally one invoice number as typed. */
export function draftQuery(invoice: string): string {
  const q = new URLSearchParams({ offset: '0', limit: String(PAGE), status: 'DRAFT' });
  if (invoice.trim()) q.set('invoiceNo', invoice.trim());
  return q.toString();
}

export const portions = (o: Pick<DraftOrder, 'items'>) => (o.items ?? []).reduce((a, i) => a + n(i.qty), 0);

interface VariantRef {
  id?: string;
  name?: string | null;
  sku?: string | number | null;
  basicProduct?: { title?: string | null; images?: { url: string; productVariantId?: string | null }[] } | null;
}

interface SlotRef {
  id?: string;
  name?: string;
  posSlot?: boolean | number | null;
}

export interface SourceStock {
  variant: VariantRef | null;
  slot: SlotRef | null;
  qty: number;
}

/** One answer of the picking list (kh-pos FindProductInSlotResult). */
export interface PickItem {
  variant: VariantRef | null;
  slot: SlotRef | null;
  lot?: { id?: string; lotNumber?: string } | null;
  qty: number;
  stock: number;
  message?: string;
  todoType?: 'TRANSFER' | 'BREAK' | 'REPACK' | 'NOTHING' | 'MIXED';
  breakdownStockInfo?: SourceStock[];
  repackStockInfo?: SourceStock[];
}

/** The picking-list request for an order: every line, how many to find. */
export function pickingQuery(items: { variantId: string; qty: number }[]): string {
  return new URLSearchParams({
    items: JSON.stringify(items.map((i) => ({ variantId: i.variantId, toFindQty: i.qty }))),
    forReplenishment: '0',
    needConversion: '1',
  }).toString();
}

/** The cache key of an order's picking list (so the list opened online can be opened offline too). */
export function pickingKey(order: Pick<DraftOrder, 'orderId' | 'items'>): string {
  return `${order.orderId}:${pickingQuery((order.items ?? []).map((i) => ({ variantId: i.variantId, qty: i.qty })))}`;
}

/** Id of a waiting move or conversion, so the same one is not queued twice. */
export const findingRecordId = (kind: 'transfer' | 'convert', orderId: string, item: PickItem) => `${kind}:${orderId}:${item.variant?.id ?? ''}:${item.slot?.id ?? ''}`;

export interface Sorted {
  transfer: PickItem[];
  convert: PickItem[];
  noStock: PickItem[];
  available: PickItem[];
}

/** The four groups the web page shows. */
export function sortPicks(items: PickItem[]): Sorted {
  const isConvert = (i: PickItem) => ['BREAK', 'REPACK', 'MIXED'].includes(i.todoType ?? '');
  return {
    transfer: items.filter((i) => i.todoType === 'TRANSFER' && i.slot && !i.slot.posSlot),
    convert: items.filter(isConvert),
    noStock: items.filter((i) => !i.slot && i.qty > 0 && !isConvert(i)),
    available: items.filter((i) => i.todoType === 'NOTHING' && i.slot?.posSlot),
  };
}

export const variantName = (v: VariantRef | null | undefined) => (v ? v.name || String(v.sku ?? '') : '');

export const pickImage = (i: PickItem) => i.variant?.basicProduct?.images?.find((x) => x.productVariantId === i.variant?.id)?.url ?? null;

/** "2 breakdown + 1 repack sources", "1 breakdown source(s)" ... as the web says it. */
export function conversionInfo(i: PickItem): string {
  const b = i.breakdownStockInfo?.length ?? 0;
  const r = i.repackStockInfo?.length ?? 0;
  if (i.todoType === 'MIXED') return `${b} breakdown + ${r} repack sources`;
  if (i.todoType === 'BREAK') return `${b} breakdown source(s)`;
  if (i.todoType === 'REPACK') return `${r} repack source(s)`;
  return '';
}

/** One move into the POS slot. */
export function transferBody(item: PickItem, posSlotId: string, orderId?: string) {
  return { currentSlotId: item.slot?.id ?? '', destinationSlotId: posSlotId, qty: n(item.qty), variantId: item.variant?.id ?? '', ...(orderId ? { orderId } : {}) };
}

/** Why a conversion cannot be sent, or null: it needs the source stock the server found. */
export function conversionProblem(item: PickItem): 'mixed' | 'sources' | null {
  const b = item.breakdownStockInfo?.length ?? 0;
  const r = item.repackStockInfo?.length ?? 0;
  if (item.todoType === 'MIXED') return b === 0 && r === 0 ? 'mixed' : null;
  return b + r === 0 ? 'sources' : null;
}

/** The body of POST /api/unit-conversion, built the way the web sheet does. */
export function conversionBody(item: PickItem, posSlotId: string) {
  const map = (list?: SourceStock[]) => (list ?? []).map((s) => ({ variantId: s.variant?.id ?? '', slotId: s.slot?.id ?? '', quantity: n(s.qty) }));
  // the web's "convert" list: the breakdown sources, else the repack sources
  const single = map(item.breakdownStockInfo && item.breakdownStockInfo.length ? item.breakdownStockInfo : item.repackStockInfo);
  const type = item.todoType as 'BREAK' | 'REPACK' | 'MIXED';
  return {
    destinationVariant: item.variant?.id ?? '',
    sourceToBreak: type === 'MIXED' ? map(item.breakdownStockInfo) : type === 'BREAK' ? single : [],
    sourceToRepack: type === 'MIXED' ? map(item.repackStockInfo) : type === 'REPACK' ? single : [],
    destinationSlot: posSlotId,
    conversionType: type,
    destinationQty: n(item.qty),
  };
}

/** The web success line after a conversion. */
export function conversionDone(item: PickItem): { qty: number; from: string; to: string } {
  const names = (l?: SourceStock[]) => (l ?? []).map((s) => s.variant?.name || 'unknown').join(', ');
  const from = item.todoType === 'MIXED' ? `breakdown: ${names(item.breakdownStockInfo)}, repack: ${names(item.repackStockInfo)}` : names(item.breakdownStockInfo && item.breakdownStockInfo.length ? item.breakdownStockInfo : item.repackStockInfo) || 'sources';
  return { qty: n(item.qty), from, to: item.variant?.name || 'variant' };
}

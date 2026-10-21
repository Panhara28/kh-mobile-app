/**
 * Settings → Delivery, like the kh-pos web Delivery page (restaurant POS only): the delivery customers of this
 * branch, each with an address and an extra price added to the prices of their orders.
 */

export interface DeliveryRow {
  id: string;
  customerName: string;
  phone?: string | null;
  address?: string | null;
  extraPrice?: string | number | null;
  createdAt?: string | null;
  createdBy?: { fullname?: string | null } | null;
  warehouse?: { name?: string | null } | null;
  orders?: unknown[] | null;
}

export interface DeliveryForm {
  customerName: string;
  address: string;
  extraPrice: number;
  [key: string]: unknown;
}

export const emptyDelivery = (): DeliveryForm => ({ customerName: '', address: '', extraPrice: 0 });

export const deliveryFormOf = (r: DeliveryRow): DeliveryForm => ({
  customerName: r.customerName,
  address: r.address ?? '',
  extraPrice: parseFloat(String(r.extraPrice ?? '0')) || 0,
});

/** The web needs a name, and the extra price can't be negative. */
export function validateDelivery(f: DeliveryForm): (keyof DeliveryForm & string) | null {
  if (!f.customerName.trim()) return 'customerName';
  if (f.extraPrice < 0) return 'extraPrice';
  return null;
}

/** The web also stores the name as the phone number (the box only asks for a name). */
export function deliveryBody(f: DeliveryForm) {
  const name = f.customerName.trim();
  return { customerName: name, phone: name, address: f.address.trim(), type: 'delivery' as const, extraPrice: f.extraPrice };
}

/** "$1.50", or "-" when there is none. */
export function extraPriceText(extra: string | number | null | undefined): string {
  if (extra === null || extra === undefined || extra === '' || String(extra) === '0') return '-';
  const n = parseFloat(String(extra));
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '-';
}

/** The list rows the web table shows: address, extra price, branch, created date, created by, orders. */
export function deliverySubtitle(r: DeliveryRow, ordersWord: string): string {
  return [
    r.address,
    extraPriceText(r.extraPrice),
    r.warehouse?.name || '-',
    r.createdAt,
    r.createdBy?.fullname || '-',
    `${r.orders?.length || 0} ${ordersWord}`,
  ]
    .filter((x) => x !== undefined && x !== null && x !== '')
    .join(' · ');
}

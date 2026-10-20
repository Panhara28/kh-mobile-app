/** Order type (dine in, take away, delivery) and the customers delivery orders are for. */

export type ServedType = 'dine_in' | 'take_away' | 'food_delivery';
export const SERVED_TYPES: ServedType[] = ['dine_in', 'take_away', 'food_delivery'];

export interface CustomerRow {
  id: string;
  customerName: string;
  phone: string;
  address?: string | null;
  type?: 'general' | 'delivery' | null;
  extraPrice?: string | number | null;
}

export interface CustomerForm {
  customerName: string;
  phone: string;
  address: string;
  type: string;
  extraPrice: number;
  [key: string]: unknown;
}

export const emptyCustomer = (): CustomerForm => ({ customerName: '', phone: '', address: '', type: 'delivery', extraPrice: 0 });

/** A customer needs a name and a phone number (kh-pos' schema); a delivery fee cannot be negative. */
export function validateCustomer(f: CustomerForm): string | null {
  if (!f.customerName.trim()) return 'customerName';
  if (f.phone.replace(/\D/g, '').length < 6) return 'phone';
  if (f.extraPrice < 0) return 'extraPrice';
  return null;
}

export function customerBody(f: CustomerForm) {
  return {
    customerName: f.customerName.trim(),
    phone: f.phone.trim(),
    address: f.address.trim(),
    type: (f.type === 'general' ? 'general' : 'delivery') as 'general' | 'delivery',
    extraPrice: Math.max(0, f.extraPrice),
  };
}

/**
 * The body of "update order type" (PUT /api/pos/order/:id/customer): dine in and take away use the
 * branch's walk-in customer; a delivery needs the chosen customer (kh-pos adds that customer's fee to the prices).
 */
export function orderTypeBody(type: ServedType, walkInCustomerId: string, deliveryCustomer: CustomerRow | null): { customerId: string; code: string; type: ServedType } | null {
  if (type === 'food_delivery') return deliveryCustomer ? { customerId: deliveryCustomer.id, code: '', type } : null;
  return walkInCustomerId ? { customerId: walkInCustomerId, code: '', type } : null;
}

export const servedTypeOf = (v: string | null | undefined): ServedType => (v === 'take_away' || v === 'food_delivery' ? v : 'dine_in');

/** Digits only, so "012 345-678" finds "012345678". */
export const phoneQuery = (text: string) => text.replace(/[^\d+]/g, '');

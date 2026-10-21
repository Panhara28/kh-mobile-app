/** Retail POS (no table): scan or search products, build a cart, then pay. The cart is kept on the phone until Charge. */

const n = (v: unknown) => Number(v) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;

export interface RetailProduct {
  variantId: string;
  productId: string;
  /** "Product (Variant)" */
  name: string;
  price: number;
  barcode: string;
}

export interface RetailLine extends RetailProduct {
  /** Order line id, made on the phone so a retry cannot double the line. */
  lineId: string;
  qty: number;
}

/** Adds one of the product, or one more when it is already in the cart. */
export function addToCart(cart: RetailLine[], p: RetailProduct, newId: () => string, qty = 1): RetailLine[] {
  const at = cart.findIndex((l) => l.variantId === p.variantId);
  if (at < 0) return [...cart, { ...p, lineId: newId(), qty }];
  return cart.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l));
}

/** Sets a quantity; zero or less takes the line out. */
export function setQty(cart: RetailLine[], variantId: string, qty: number): RetailLine[] {
  if (!(qty > 0)) return cart.filter((l) => l.variantId !== variantId);
  return cart.map((l) => (l.variantId === variantId ? { ...l, qty } : l));
}

export const cartTotal = (cart: RetailLine[]) => cents(cart.reduce((s, l) => s + n(l.price) * n(l.qty), 0));
export const cartCount = (cart: RetailLine[]) => cart.reduce((s, l) => s + n(l.qty), 0);

/** The product a scanned or typed code belongs to: its barcode exactly (ignoring spaces), else null. */
export function matchBarcode(products: RetailProduct[], code: string): RetailProduct | null {
  const c = code.trim();
  if (!c) return null;
  return products.find((p) => p.barcode && p.barcode.trim() === c) ?? null;
}

/** The body that opens the sale's order in kh-pos: no table, every line at its price. */
export function retailOrderBody(input: { warehouseId: string; slotId: string; customerId: string; invoiceNo: number; orderId?: string }, cart: RetailLine[]) {
  return {
    ...(input.orderId ? { orderId: input.orderId } : {}),
    warehouseId: input.warehouseId,
    slotId: input.slotId,
    customerId: input.customerId,
    invoiceNo: input.invoiceNo,
    items: cart.map((l) => ({ id: l.lineId, variantId: l.variantId, qty: l.qty, price: String(l.price) })),
  };
}

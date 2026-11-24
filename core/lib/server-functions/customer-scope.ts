// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../db/db";
import type { UserAuth } from "./get-auth-from-token";

/** Error with an HTTP status; the API answers with that status instead of 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

/**
 * True when the request comes from a customer (walk-in diner or app user), not from staff.
 * Walk-in requests carry the branch system admin only as context (`actingAdmin`), so they
 * still count as customer requests here.
 */
export function isCustomerRequest(userAuth: UserAuth): boolean {
  return !!userAuth.customer && (!userAuth.admin || !!userAuth.actingAdmin);
}

/** The table a walk-in diner logged in at. Customers without one can't touch table orders. */
export function requireCustomerTable(userAuth: UserAuth): string {
  const tableId = userAuth.customer?.tableId;
  if (!tableId) throw new ForbiddenError("Scan the QR code on your table to order");
  return tableId;
}

/**
 * A customer may only change the open (DRAFT) order of the table they scanned, in their branch.
 * Returns the order row.
 */
export async function assertCustomerOwnsOrder(db: Db, userAuth: UserAuth, orderId: string) {
  const tableId = requireCustomerTable(userAuth);
  const order = await db.first<{ order_id: string; order_status: string; warehouse_id: string; table_number: string; tag_no: string | null }>(
    "SELECT * FROM customer_order WHERE order_id = ? LIMIT 1",
    [orderId],
  );
  if (
    !order ||
    order.order_status !== "DRAFT" ||
    order.warehouse_id !== userAuth.customer?.warehouseId ||
    order.table_number !== tableId ||
    // several groups share the table: which one this diner belongs to is unknown
    !!order.tag_no
  ) {
    throw new ForbiddenError("This order doesn't belong to your table");
  }
  return order;
}

/** The order line must belong to the given order. */
export async function assertItemInOrder(db: Db, orderId: string, orderDetailId: string) {
  const item = await db.first("SELECT * FROM customer_order_detail WHERE order_id = ? AND order_detail_id = ? LIMIT 1", [
    orderId,
    orderDetailId,
  ]);
  if (!item) throw new ForbiddenError("This item doesn't belong to your order");
  return item;
}

/** Customers can only change or remove items the kitchen hasn't started. */
export async function assertItemNotStarted(db: Db, orderDetailId: string) {
  const started = await db.first(
    "SELECT 1 FROM order_item_status WHERE order_item_id = ? AND status <> 'pending' AND qty > 0 LIMIT 1",
    [orderDetailId],
  );
  if (started) throw new ForbiddenError("The kitchen has already started this item");
}

/** Menu price of a variant, read from the database. Customers never set prices. */
export async function menuPriceOf(db: Db, variantId: string): Promise<string> {
  const row = await db.first<{ price: string | number }>(
    `SELECT product_variant.price FROM product_variant
     INNER JOIN product ON product.id = product_variant.product_id
     WHERE product_variant.id = ? AND product_variant.deleted_at IS NULL AND product.deleted_at IS NULL LIMIT 1`,
    [variantId],
  );
  if (!row) throw new HttpError(400, "This item is not on the menu");
  return String(row.price);
}

/** Price of a modifier option from the database; free-text notes from customers cost nothing. */
export async function modifierPriceOf(db: Db, modifierItemId: string): Promise<number> {
  if (modifierItemId === "notes") return 0;
  const row = await db.first<{ price: string | number }>(
    "SELECT price FROM modifier_items WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [modifierItemId],
  );
  if (!row) throw new HttpError(400, "This option is not on the menu");
  return Number(row.price);
}

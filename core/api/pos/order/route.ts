// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { InvoiceNumberService } from "../../../classes/invoice-number";
import { getTableMode } from "../../../classes/table-mode";
import { OrderService } from "../../../classes/order";
import {
  ForbiddenError,
  HttpError,
  isCustomerRequest,
  menuPriceOf,
  requireCustomerTable,
} from "../../../lib/server-functions/customer-scope";
import type { UserAuth, UserInfo } from "../../../lib/server-functions/get-auth-from-token";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import type { Db } from "../../../db/db";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";
import { getOrderList } from "./get-order-list";

const inputSchema = z.object({
  warehouseId: z.string(),
  slotId: z.string(),
  customerId: z.string(),
  invoiceNo: z.number(),
  tableNumber: z.string().optional(),
  tagNo: z.string().max(10).optional(),
  items: z.array(
    z.object({
      id: z.string(),
      variantId: z.string(),
      qty: z.number(),
      price: z.string(),
      reservation: z
        .array(
          z.object({
            showtimeId: z.string(),
            seatId: z.string(),
            price: z.number(),
            code: z.string().optional(),
          })
        )
        .optional(),
    })
  ),
  customer: z.number().optional(),
  orderId: z.string().min(8).max(64).optional(),
});

/** Customers order whole portions only. */
const customerQtySchema = z.number().int().min(1).max(999);

export const POST = withAuthApi<unknown, unknown>(
  async ({ db, body, userAuth }) => {
    const input = inputSchema.parse(body);

    const tr = await db.tx(async (trx) => {
      const orderService = new OrderService(trx);
      const createdBy = userAuth.admin! || {
        ...userAuth.customer!,
        currentWarehouseId: userAuth.customer?.warehouseId,
      };

      // Customers only open an order for the table they scanned. The server decides the
      // branch, customer, POS slot, invoice number and prices; the request's values are ignored.
      const options = isCustomerRequest(userAuth)
        ? await customerOrderInput(trx, userAuth, input, createdBy)
        : input;

      const { order, variantDiscountApplied, promotionApplied } =
        await orderService.create({
        ...options,
        createdBy,
        status: "DRAFT",
      });

      return { orderId: order.order_id, variantDiscountApplied, promotionApplied };
    });

    return NextResponse.json(
      {
        success: true,
        result: tr.orderId,
        variantDiscountApplied: tr.variantDiscountApplied,
        promotionApplied: tr.promotionApplied,
      },
      { status: 200 },
    );
  },
  ["ADMIN", "CUSTOMER"]
);

export const GET = getOrderList;

async function customerOrderInput(
  trx: Db,
  userAuth: UserAuth,
  input: z.infer<typeof inputSchema>,
  createdBy: Parameters<OrderService["create"]>[0]["createdBy"],
): Promise<z.infer<typeof inputSchema>> {
  const tableId = requireCustomerTable(userAuth);
  const warehouseId = userAuth.customer!.warehouseId;

  if ((await getTableMode(trx, warehouseId)).mode === "TAG") {
    throw new HttpError(409, "Please order with our staff");
  }

  const table = await trx.row("restaurant_tables", { AND: [{ id: tableId }, { warehouse_id: warehouseId }, { deleted_at: null }] });
  if (!table) throw new ForbiddenError("Table not found in this branch");

  const slot = await trx.row("warehouse_slot", { AND: [{ warehouse_id: warehouseId }, { pos_slot: 1 }] });
  if (!slot) throw new HttpError(409, "This branch has no POS slot");

  const [invoiceNo] = await new InvoiceNumberService(
    trx,
    createdBy as UserInfo,
  ).getNextInvoiceNumber(1);
  if (!invoiceNo) {
    throw new HttpError(409, "This branch has no invoice receipt settings");
  }

  const items = [];
  for (const item of input.items) {
    items.push({
      id: item.id,
      variantId: item.variantId,
      qty: customerQtySchema.parse(item.qty),
      price: await menuPriceOf(trx, item.variantId),
    });
  }

  return {
    warehouseId,
    slotId: slot.id,
    customerId: userAuth.customer!.id,
    invoiceNo: Number(invoiceNo),
    tableNumber: tableId,
    items,
    customer: input.customer,
  };
}

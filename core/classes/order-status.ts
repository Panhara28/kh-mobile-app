// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { OrderItemStatusType } from "../dataloader/order-status-item.loader";
import { table_order_item_status } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import {
  getOrderDetail,
  OrderService,
  recalculateCustomerOrder,
  updateOrderDetail,
} from "./order";
import { PrintToKitchenService } from "./print-to-kitchen";


export class OrderStatusService {
  constructor(
    protected tx: Db,
    protected user: UserInfo,
  ) {}

  async forceUpdateOrderItemStatusQty(input: OrderItemStatusType) {
    await this.tx.tx(async (trx) => {
      await trx.table("order_item_status")
        .insert({
          order_item_id: input.orderItemId,
          status: input.status,
          qty: input.qty,
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
        })
        .onConflict(["order_item_id", "status"])
        .merge({
          qty: input.qty,
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
        });

      return updateOrderItemQty(input.orderItemId, trx);
    });
  }

  async updateOrderItemStatusUsingActualStatus(
    orderDetailId: string,
    qty: number,
    fromStatus: "pending" | "cooking",
    toStatus: "cooking" | "served",
  ) {
    if (fromStatus === toStatus)
      throw new Error("Cannot change to the same status");
    if (fromStatus === "pending" && toStatus === "served")
      throw new Error("Cannot change directly from pending to served");

    return this.tx.tx<void>(async (trx) => {
      // check if there is available order item with status fromStatus
      const exists = await trx.row<table_order_item_status>("order_item_status", { AND: [{ order_item_id: orderDetailId }, { status: fromStatus }, { qty: { gte: qty } }] });

      const printKitchenService = new PrintToKitchenService(trx, this.user);

      if (!exists) {
        throw new Error(
          "The order item is not in pending status or insufficient quantity",
        );
      }

      // add or update order items with destination status
      await trx.table("order_item_status")
        .insert({
          order_item_id: orderDetailId,
          status: toStatus,
          qty,
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
        })
        .onConflict(["order_item_id", "status"])
        .merge({
          qty: trx.raw("order_item_status.qty + :qty", { qty }),
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
        });

      // decrement the quantity from the source status. Its created_at / created_by are kept:
      // they record when portions last ENTERED that status (e.g. the cooking row = when it was
      // sent to the kitchen). Overwriting them here made "sent" equal "served" after serving.
      await trx.table("order_item_status")
        .where({ order_item_id: orderDetailId, status: fromStatus })
        .decrement("qty", qty);

      await updateOrderItemQty(orderDetailId, trx);

      // Queues the kitchen ticket; the server's kitchen print worker prints it (src/lib/printing/kitchen-queue.ts).
      if (fromStatus === "pending" && toStatus === "cooking") {
        await printKitchenService.printOrderToKitchen(orderDetailId, qty);
      }
    });
  }
}

async function updateOrderItemQty(orderItemId: string, tx: Db) {
  const orderItem = await getOrderDetail(orderItemId, tx);
  if (!orderItem) throw new Error("Order item not found");

  const allOrderStatus: table_order_item_status[] = await tx.rows<table_order_item_status>("order_item_status", { order_item_id: orderItemId });

  const totalQty = allOrderStatus.reduce(
    (acc, item) => acc + Number(item.qty || 0),
    0,
  );

  if (totalQty > 0) {
    await updateOrderDetail(orderItemId, { qty: totalQty }, tx);
  } else {
    await new OrderService(tx).deleteOrderItem(
      orderItem.order_id!,
      orderItemId,
    );
  }

  await recalculateCustomerOrder({ ...orderItem, qty: totalQty }, tx);
  return true;
}

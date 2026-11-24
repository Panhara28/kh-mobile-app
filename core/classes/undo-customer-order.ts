// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  table_backlog_orders,
  table_customer_order,
  table_customer_order_detail,
  table_fulfilment,
  table_fulfilment_detail,
  table_inventory,
  table_inventory_transactions,
  table_order_payment,
  table_setting,
} from "../generated/tables";
import { HttpError } from "../lib/server-functions/customer-scope";
import { getTableMode, lowestFreeTag, refreshTableStatus } from "./table-mode";
import { Formatter } from "../lib/formatter";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";

export class UndoCustomerOrderService {
  constructor(
    protected db: Db,
    protected user: UserInfo,
  ) {}

  async undoOrderFromCompletedToDraft(orderId: string) {
    const now = Formatter.getNowDateTime();
    return await this.db.tx(async (trx) => {
      const editableOrder = await getEditableOrder(trx, orderId);
      if (!editableOrder) {
        throw new Error("This order is not editable");
      }

      const fulfillment = await getFulfillmentDetail(trx, orderId);

      // Stock in back
      await stockInBackForUndo(fulfillment.fulfillmentDetail, trx);

      // remove fulfillment record
      if (fulfillment.fulfillment?.id) {
        await removeFulfillment(fulfillment.fulfillment?.id, trx);
      }

      // remove payment record
      await trx.del("order_payment", { order_id: orderId });

      // update fulfilled qty to 0
      await trx.update("customer_order_detail", { order_id: orderId }, { fulfilled_qty: 0 });

      const tagged = await reopenedTag(trx, editableOrder.order, this.user.currentWarehouseId!);

      // update customer order
      await trx.update("customer_order", { order_id: orderId }, { order_status: "DRAFT", paid_at: null, updated_at: now, tag_no: tagged.tagNo });

      // update seat reservation status to pending
      const items = await trx.rows("customer_order_detail", { order_id: orderId });
      for (const item of items) {
        await trx.update("seat_reservation", { order_detail_id: item.order_detail_id }, {
            reservation_status: "pending",
            confirmed_at: null,
            confirmed_by: null,
          });
      }

      if (tagged.mode === "TAG" && editableOrder.order.table_number) {
        // The group goes back to its own table, which it may share.
        await refreshTableStatus(trx, editableOrder.order.table_number, "available");
        return {
          orderId,
          tableNumber: editableOrder.order.table_number,
          tagNo: tagged.tagNo,
        };
      }

      if (!!editableOrder.order.table_number) {
        const table = await trx.row("restaurant_tables", { AND: [{ id: editableOrder.order.table_number }, { status: "available" }, { deleted_at: null }, { warehouse_id: this.user.currentWarehouseId }] });

        if (table) {
          await trx.update("restaurant_tables", { id: table.id }, { status: "order_taken" });
        } else {
          const availableTable = await trx.row("restaurant_tables", { AND: [{ status: "available" }, { deleted_at: null }, { warehouse_id: this.user.currentWarehouseId }] });
          if (availableTable) {
            await trx.update("restaurant_tables", { id: availableTable.id }, { status: "order_taken" });
            await trx.update("customer_order", { order_id: orderId }, { table_number: availableTable.id });

            return {
              orderId,
              tableNumber: availableTable.id,
            };
          }
        }
      }

      return {
        orderId,
        tableNumber: null,
      };
    });
  }
}

/** The tag of an order being reopened: its own when still free, else the lowest free one. */
async function reopenedTag(trx: Db, order: table_customer_order, warehouseId: string) {
  const { mode, tagCount } = await getTableMode(trx, warehouseId);
  if (mode !== "TAG" || !order.table_number) return { mode, tagNo: null };
  const table = await trx.row("restaurant_tables", { id: order.table_number, warehouse_id: warehouseId, deleted_at: null });
  if (!table) throw new HttpError(409, "The table of this order no longer exists");
  if (order.tag_no) {
    const taken = await trx.row("customer_order", { warehouse_id: warehouseId, order_status: "DRAFT", tag_no: order.tag_no });
    if (!taken) return { mode, tagNo: order.tag_no };
  } else if (table.section === "delivery") {
    return { mode, tagNo: null };
  }
  return { mode, tagNo: await lowestFreeTag(trx, warehouseId, tagCount) };
}

async function removeFulfillment(fulfillmentId: string, tx: Db) {
  await tx.del("fulfilment", { id: fulfillmentId });

  // remove fulfillment detail record
  await tx.del("fulfilment_detail", { fulfilment_id: fulfillmentId });
}

async function stockInBackForUndo(
  fulfillmentDetails: table_fulfilment_detail[],
  tx: Db,
) {
  for (const f of fulfillmentDetails) {
    if (!f.transaction_id)
      throw new Error("Invalid transaction of fulfillment" + f.id);

    // if transaction_id start with back_log:: then we need to delete from backlog_orders

    if (f.transaction_id.startsWith("back_log::")) {
      await tx.del("backlog_orders", { id: f.transaction_id });
      continue;
    }

    const transactionDetail = await getTransaction(f.transaction_id, tx);
    if (!transactionDetail) {
      throw new Error("Transaction not found for fulfillment " + f.id);
    }
    await increaseStockBackByTransaction(transactionDetail, tx);

    // remove this transaction
    await tx.del("inventory_transactions", { id: transactionDetail.id });
  }
}

async function increaseStockBackByTransaction(
  transactionDetail: table_inventory_transactions,
  tx: Db,
) {
  const inventory = await findInventoryByInventoryTransaction(
    transactionDetail,
    tx,
  );
  if (!inventory) {
    throw new Error(
      "Inventory not found for transaction " + transactionDetail.id,
    );
  }

  await tx
    .table<table_inventory>("inventory")
    .increment("qty", Math.abs(transactionDetail.qty))
    .where("id", inventory.id);
}

async function findInventoryByInventoryTransaction(
  transaction: table_inventory_transactions,
  tx: Db,
) {
  return await tx.row<table_inventory>("inventory", { AND: [{ variant_id: transaction.variant_id }, { slot_id: transaction.slot_id }, { lot_id: transaction.lot_id }] });
}

async function getTransaction(
  trxId: string,
  tx: Db,
): Promise<table_inventory_transactions | null> {
  const transactionDetail: table_inventory_transactions = await tx.row<table_inventory_transactions>("inventory_transactions", { id: trxId });
  if (!transactionDetail) return null;
  return transactionDetail;
}

async function getFulfillmentDetail(
  trx: Db,
  orderId: string,
): Promise<{
  fulfillment: table_fulfilment | null;
  fulfillmentDetail: table_fulfilment_detail[];
}> {
  const fulfillment: table_fulfilment = await trx.row("fulfilment", { order_id: orderId });

  if (!fulfillment) {
    return { fulfillment: null, fulfillmentDetail: [] };
  }

  const fulfillmentDetail: table_fulfilment_detail[] = await trx.rows<table_fulfilment_detail>("fulfilment_detail", { fulfilment_id: fulfillment.id });

  return { fulfillment, fulfillmentDetail };
}

async function getEditableDays(trx: Db) {
  const isEditable: table_setting = await trx.row("setting", { option: "EDITABLE_ORDER_DAY" });

  const editableDays = isEditable ? parseInt(isEditable.value || "1", 10) : 0;

  return editableDays;
}

async function getEditableOrder(
  trx: Db,
  orderId: string,
): Promise<{
  order: table_customer_order;
  orderDetail: table_customer_order_detail[];
} | null> {
  const editableDays = await getEditableDays(trx);
  const latestEditableDate = Formatter.addDateToNow(-editableDays, "day");

  const order: table_customer_order = await trx.row<table_customer_order>("customer_order", { AND: [{ order_id: orderId }, { order_status: "COMPLETED" }, { paid_at: { gte: latestEditableDate } }] });
  if (!order) {
    return null;
  }

  const orderDetail: table_customer_order_detail[] = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });

  return { order, orderDetail };
}

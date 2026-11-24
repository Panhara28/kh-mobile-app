// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  table_customer_order,
  table_customer_order_detail,
  table_order_detail_modifier,
  table_order_item_status,
  table_restaurant_tables,
} from "../generated/tables";
import { ChangeTableService } from "./change-table";
import { HttpError } from "../lib/server-functions/customer-scope";
import { Formatter } from "../lib/formatter";
import { generateId } from "../lib/generate-id";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import { table_discount_log } from "../generated/tables";
import type { Db } from "../db/db";
import { InvoiceNumberService } from "./invoice-number";
import {
  getOrderDetail,
  OrderService,
  recalculateCustomerOrder,
} from "./order";
import {
  getDiscountLogByOrderDetailId,
  ORDER_LEVEL_DISCOUNT_ID,
} from "./order-discount";
import { getAppliedModifiers, OrderModifierService } from "./order-modifier";
import { getTableMode } from "./table-mode";
import { OrderStatusService } from "./order-status";

/**
 * `discount_log.discount_id` for a discount frozen by a table transfer. It is a
 * plain stored AMOUNT — `applyDiscountToOrderItem` adds it verbatim and the
 * order-level `maxQtyPerLine` pass never recomputes or caps it, so a merged
 * line keeps exactly the discount it and the incoming units brought with them
 * instead of being re-rationed against the destination order's other lines.
 */
const TRANSFER_DISCOUNT_ID = "transfer";

export interface TransferProp {
  sourceTableId: string;
  orderId: string;
  orderItems: OrderItem[];
  destinationTableId: string;
  /**
   * Carry each moved line's current discount amount onto the destination as a
   * frozen amount. Defaults to `true`; set `false` to move the items at full
   * price. Discounts already on the destination's own lines are kept either way.
   */
  transferDiscount?: boolean;
}

interface OrderItem {
  orderItemId: string;
  variantId: string;
  orderItemStatuses: OrderItemStatus[];
}

interface OrderItemStatus {
  status: table_order_item_status["status"];
  quantity: number;
}

export class TransferOrderTableService {
  constructor(
    protected tx: Db,
    protected user: UserInfo,
  ) {}

  async createOrderTransfer(orderInfo: TransferProp) {
    return await this.tx.tx(async (trx) => {
      const { sourceTableId, orderId, destinationTableId } = orderInfo;
      const transferDiscount = orderInfo.transferDiscount ?? true;

      const order = await getOrder(orderId, trx);
      if (!order || order.warehouse_id !== this.user.currentWarehouseId) throw new HttpError(404, "Order not found");
      if (order.order_status !== "DRAFT") throw new HttpError(409, "This order is already closed");
      if (order.table_number !== sourceTableId) {
        throw new HttpError(409, "This order was moved by someone else. Refresh and try again.");
      }
      if (sourceTableId === destinationTableId) throw new HttpError(400, "The order is already on this table");

      const tableInfo = await getTableInfo(destinationTableId, trx);
      if (!tableInfo || tableInfo.deleted_at || tableInfo.warehouse_id !== order.warehouse_id) {
        throw new HttpError(404, "Destination table not found");
      }
      const originalOrderItem = await getOrderItems(orderId, trx);
      if (!originalOrderItem) throw new Error("Original order items not found");
      const orderItems = checkedItems(originalOrderItem, orderInfo.orderItems);

      // The open order decides, not the status column, which can be out of date.
      const destinationOrder = await getDraftOrderByTableId(destinationTableId, order.warehouse_id || "", trx);

      const isCompletedOrderItem = isExactMatch(
        originalOrderItem.map((item) => ({
          orderItemId: item.item.order_detail_id || "",
          quantity: item.item.qty || 0,
          variantId: item.item.variant_id || "",
          orderItemStatuses: item.status.map((status) => ({
            status: status.status,
            quantity: status.qty || 0,
          })),
        })),
        orderItems,
      );

      if ((await getTableMode(trx, order.warehouse_id)).mode === "TAG") {
        // groups keep their own order and tag: no merge, no split
        if (!isCompletedOrderItem) throw new HttpError(409, "Only whole orders can change table");
        return await transferTable(orderId, sourceTableId, destinationTableId, trx, this.user, transferDiscount);
      }

      if (!destinationOrder) {
        if (isCompletedOrderItem) {
          // transfer: transfer all ordered items from one table to another empty table
          return await transferTable(
            orderId,
            sourceTableId,
            destinationTableId,
            trx,
            this.user,
            transferDiscount,
          );
        } else {
          // split: transfer partial items from one table to another empty table
          return splitTable(
            order,
            originalOrderItem.map((item) => ({
              orderItemId: item.item.order_detail_id || "",
              quantity: item.item.qty || 0,
              variantId: item.item.variant_id || "",
              price: item.item.price || "",
              discount_amount: item.item.discount_amount || "",
              modifer_amount: item.item.modifer_amount || "",
              orderItemStatuses: item.status.map((status) => ({
                status: status.status,
                quantity: status.qty || 0,
              })),
            })),
            orderItems,
            destinationTableId,
            trx,
            this.user,
            transferDiscount,
          );
        }
      } else {
        // merge: transfer items(all or partial) to occupied table
        return mergeTable(
          order,
          originalOrderItem.map((item) => ({
            orderItemId: item.item.order_detail_id || "",
            quantity: item.item.qty || 0,
            variantId: item.item.variant_id || "",
            price: item.item.price || "",
            discount_amount: item.item.discount_amount || "",
            modifer_amount: item.item.modifer_amount || "",
            orderItemStatuses: item.status.map((status) => ({
              status: status.status,
              quantity: status.qty || 0,
            })),
          })),
          orderItems,
          destinationOrder,
          sourceTableId,
          trx,
          this.user,
          transferDiscount,
        );
      }
    });
  }
}

/**
 * A line's item-level discount total (everything except the auto order-level
 * slice, which the destination order recomputes for itself).
 */
async function getItemDiscountTotal(
  orderDetailId: string,
  trx: Db,
): Promise<number> {
  const rows = await getDiscountLogByOrderDetailId(orderDetailId, trx);
  return rows
    .filter((d) => d.discount_id !== ORDER_LEVEL_DISCOUNT_ID)
    .reduce((sum, d) => sum + Number(d.discount_amount || 0), 0);
}

/**
 * Replace every discount on a destination line with a single frozen "transfer"
 * discount of `amount`. `amount <= 0` just clears the line's discounts (used
 * when the items move at full price). Call this before the line's final
 * recalculation so the stored amount is what sticks.
 */
async function setTransferDiscount(
  orderDetailId: string,
  amount: number,
  user: UserInfo,
  trx: Db,
): Promise<void> {
  await trx.del("discount_log", { order_detail_id: orderDetailId });

  const frozen = Math.round(amount * 100) / 100;
  if (frozen <= 0) return;

  await trx.insert("discount_log", {
    id: generateId(),
    order_detail_id: orderDetailId,
    discount_id: TRANSFER_DISCOUNT_ID,
    discount_title: "Transferred discount",
    discount_type: "AMOUNT",
    value: String(frozen),
    discount_amount: String(frozen),
    is_manual_discount: 0,
    created_at: Formatter.getNowDateTime(),
    created_by: user.id,
  });
}

/** Recalculate a whole order's totals via any one of its lines. */
async function recalcOrder(orderId: string, trx: Db): Promise<void> {
  const line = await trx.row<table_customer_order_detail>("customer_order_detail", { order_id: orderId });
  if (!line) return;
  const detail = await getOrderDetail(line.order_detail_id, trx);
  if (detail) await recalculateCustomerOrder(detail, trx);
}

/** A line's discount total and quantity, captured before a transfer runs. */
interface LineSnapshot {
  discount: number;
  qty: number;
}

async function snapshotOrderLines(
  orderId: string,
  trx: Db,
): Promise<Map<string, LineSnapshot>> {
  const snap = new Map<string, LineSnapshot>();
  const lines = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });
  for (const line of lines) {
    snap.set(line.order_detail_id, {
      discount: await getItemDiscountTotal(line.order_detail_id, trx),
      qty: Number(line.qty || 0),
    });
  }
  return snap;
}

/**
 * Freeze the lines still on a source order after a (partial) transfer: each
 * keeps its pre-transfer discount scaled down to the quantity it has left, so
 * removing units doesn't free budget that the order-level maxQty pass would then
 * hand to the source table's other lines.
 */
async function freezeSourceLeftovers(
  orderId: string,
  snapshot: Map<string, LineSnapshot>,
  user: UserInfo,
  trx: Db,
): Promise<void> {
  const lines = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });
  if (lines.length === 0) return;
  for (const line of lines) {
    const before = snapshot.get(line.order_detail_id);
    const frozen =
      before && before.qty > 0
        ? (before.discount * Number(line.qty || 0)) / before.qty
        : 0;
    await setTransferDiscount(line.order_detail_id, frozen, user, trx);
  }
  await recalcOrder(orderId, trx);
}

async function splitTable(
  order: table_customer_order,
  originalItems: (OrderItem & {
    price: string;
    discount_amount: string;
    modifer_amount: string;
  })[],
  itemsToTransfer: OrderItem[],
  destinationTableId: string,
  tx: Db,
  user: UserInfo,
  transferDiscount: boolean,
): Promise<string> {
  return await tx.tx(async (trx) => {
    const orderService = new OrderService(trx);
    const orderStatusService = new OrderStatusService(trx, user);

    // Snapshot the source order's lines before any reduction re-rations them.
    const sourceBefore = await snapshotOrderLines(order.order_id, trx);

    /* Create new order */
    // find invoice number
    const invoiceNumber = await new InvoiceNumberService(
      trx,
      user,
    ).getNextInvoiceNumber(1);
    const newOrder = await orderService.create({
      items: [],
      invoiceNo: invoiceNumber[0],
      customerId: order.customer_id,
      warehouseId: order.warehouse_id,
      createdBy: user,
      status: "DRAFT",
      tableNumber: destinationTableId,
    });

    for (const itemToTransfer of itemsToTransfer) {
      const originalItem = originalItems.find(
        (i) => i.orderItemId === itemToTransfer.orderItemId,
      );
      if (!originalItem) continue;

      // Modifiers must be read before the source line is (possibly) deleted.
      const sourceModifiers = await getAppliedModifiers(
        originalItem.orderItemId,
        trx,
      );

      // How much of the source line is moving (this is a partial split), and its
      // share of the source line's discount — from the up-front snapshot so an
      // earlier iteration's recalc can't skew it.
      const movedQty = itemToTransfer.orderItemStatuses.reduce(
        (acc, s) => acc + s.quantity,
        0,
      );
      const sourceItemDiscount =
        sourceBefore.get(originalItem.orderItemId)?.discount ?? 0;
      const sourceQty = Math.max(
        movedQty,
        sourceBefore.get(originalItem.orderItemId)?.qty ?? 0,
        1,
      );
      const movedDiscount = transferDiscount
        ? (sourceItemDiscount * movedQty) / sourceQty
        : 0;

      for (const status of itemToTransfer.orderItemStatuses) {
        const originalStatus = originalItem.orderItemStatuses.find(
          (s) => s.status === status.status,
        );
        if (!originalStatus) continue;

        const leftOverStatusQty =
          (originalStatus?.quantity || 0) - status.quantity;

        /* Update original order item status quantity */
        await orderStatusService.forceUpdateOrderItemStatusQty({
          orderItemId: originalItem.orderItemId,
          status: originalStatus?.status,
          qty: Math.max(leftOverStatusQty, 0),
        });
      }

      /* Add new order item */
      const newItemId = generateId();
      await orderService.addOrderItem(
        newOrder.order.order_id,
        {
          id: newItemId,
          variantId: itemToTransfer.variantId,
          qty: 0,
          price: originalItem.price || "",
        },
        user,
        "TRANSFER",
      );

      // Freeze the moved portion of the source discount onto the new line so the
      // destination order's discount rules can't re-ration or cap it. Runs after
      // addOrderItem (which may auto-add a "variant" row) and is superseded by
      // the final status recalculation.
      await setTransferDiscount(newItemId, movedDiscount, user, trx);

      // apply modifier if any
      const modifierService = new OrderModifierService(trx, user);
      for (const modifier of sourceModifiers) {
        await modifierService.addOrderModifier({
          orderDetailId: newItemId,
          modifierItemId: modifier.modifier_item_id || "notes",
          price: Number(modifier.price || 0),
          notes: modifier.notes ?? undefined,
        });
      }

      // update order item status
      for (const status of itemToTransfer.orderItemStatuses) {
        await orderStatusService.forceUpdateOrderItemStatusQty({
          orderItemId: newItemId,
          status: status.status,
          qty: status.quantity,
        });
      }
    }

    // Freeze what stayed on the source table so its remaining lines don't absorb
    // the discount budget the moved units freed up.
    await freezeSourceLeftovers(order.order_id, sourceBefore, user, trx);

    return newOrder.order.order_id;
  });
}

async function mergeTable(
  sourceOrder: table_customer_order,
  originalItems: (OrderItem & {
    price: string;
    discount_amount: string;
    modifer_amount: string;
  })[],
  itemsToTransfer: OrderItem[],
  destinationOrder: table_customer_order,
  sourceTableId: string,
  tx: Db,
  user: UserInfo,
  transferDiscount: boolean,
): Promise<string> {
  return await tx.tx(async (trx) => {
    const orderService = new OrderService(trx);
    const orderStatusService = new OrderStatusService(trx, user);

    // Snapshot both orders' line discounts up front: the per-item recalculations
    // below rebuild every line, so a later read would already be re-rationed.
    const destBefore = await snapshotOrderLines(destinationOrder.order_id!, trx);
    const sourceBefore = await snapshotOrderLines(sourceOrder.order_id!, trx);

    // Frozen discount to add onto each destination line (its own discount is
    // kept from destBefore; this is the portion carried in from the source).
    const movedIntoLine = new Map<string, number>();

    // Process each item that needs to be transferred
    for (const itemToTransfer of itemsToTransfer) {
      // Find the corresponding original item with full details
      const originalItem = originalItems.find(
        (i) => i.orderItemId === itemToTransfer.orderItemId,
      );
      if (!originalItem) continue;

      // Use the up-front snapshot for the source line's discount and quantity —
      // an earlier iteration's source recalc may already have re-rationed it.
      const sourceItemDiscount =
        sourceBefore.get(originalItem.orderItemId)?.discount ?? 0;
      const sourceQty = Math.max(
        1,
        sourceBefore.get(originalItem.orderItemId)?.qty ?? 0,
      );
      // Modifiers must be read before the source line is (possibly) deleted.
      const originalModifier: table_order_detail_modifier[] =
        await getAppliedModifiers(originalItem.orderItemId, trx);

      // Update source order quantities by reducing the transferred amounts
      for (const status of itemToTransfer.orderItemStatuses) {
        const originalStatus = originalItem.orderItemStatuses.find(
          (s) => s.status === status.status,
        );
        if (!originalStatus) continue;

        // Calculate remaining quantity in source after transfer
        const leftOverStatusQty =
          (originalStatus?.quantity || 0) - status.quantity;

        // Update the source order item status with remaining quantity
        await orderStatusService.forceUpdateOrderItemStatusQty({
          orderItemId: originalItem.orderItemId,
          status: originalStatus?.status,
          qty: Math.max(leftOverStatusQty, 0),
        });
      }

      // Calculate total quantity being transferred for this item
      const totalTransferQty = itemToTransfer.orderItemStatuses.reduce(
        (acc, status) => acc + status.quantity,
        0,
      );

      // Discount carried by the moved units (per-unit share of the source line).
      const movedDiscount = transferDiscount
        ? (sourceItemDiscount * totalTransferQty) / sourceQty
        : 0;
      const movedUnitsAreDiscounted = movedDiscount > 0;

      // Destination lines that already hold this variant.
      const existingItemInDestination = await tx.rows<table_customer_order_detail>("customer_order_detail", { AND: [{ order_id: destinationOrder.order_id }, { variant_id: itemToTransfer.variantId }] });

      // Pick the line to merge into: same modifiers AND the same discount state
      // as the incoming units — a discounted unit joins a discounted line, a
      // full-price unit joins a full-price line — so a line never ends up mixing
      // discounted and full-price units. If nothing matches, start a new line.
      let mergeInto: table_customer_order_detail | undefined;
      for (const destItems of existingItemInDestination) {
        const destModifier: table_order_detail_modifier[] = (
          await tx.rows<table_order_detail_modifier>("order_detail_modifier", { order_detail_id: destItems.order_detail_id })
        ).sort();
        if (
          !isOrderItemModifierSame([...originalModifier].sort(), destModifier)
        ) {
          continue;
        }
        const lineIsDiscounted =
          (destBefore.get(destItems.order_detail_id)?.discount ?? 0) > 0;
        if (lineIsDiscounted === movedUnitsAreDiscounted) {
          mergeInto = destItems;
          break;
        }
      }

      let newItemId: string;
      let orderStatus = itemToTransfer.orderItemStatuses;

      if (mergeInto) {
        // Add the transferred quantities on top of the matched line.
        newItemId = mergeInto.order_detail_id;
        const existingStatus = await tx.rows<table_order_item_status>("order_item_status", { order_item_id: newItemId });
        orderStatus = itemToTransfer.orderItemStatuses.map((s) => {
          const qty = Number(
            existingStatus.find((f) => f.status === s.status)?.qty ?? 0,
          );
          return { ...s, quantity: qty + s.quantity };
        });
      } else {
        // Start a new destination line and carry the source modifiers onto it.
        newItemId = generateId();
        await orderService.addOrderItem(
          destinationOrder.order_id!,
          {
            id: newItemId,
            variantId: itemToTransfer.variantId,
            qty: totalTransferQty,
            price: originalItem.price || "",
          },
          user,
          "TRANSFER",
        );
        if (originalModifier.length > 0) {
          const modifierService = new OrderModifierService(trx, user);
          for (const modifier of originalModifier) {
            await modifierService.addOrderModifier({
              orderDetailId: newItemId,
              modifierItemId: modifier.modifier_item_id || "notes",
              price: Number(modifier.price || 0),
              notes: modifier.notes ?? undefined,
            });
          }
        }
      }

      // Remember the carried-in discount for this line; frozen in one pass once
      // every item is placed.
      movedIntoLine.set(
        newItemId,
        (movedIntoLine.get(newItemId) ?? 0) + movedDiscount,
      );

      // Set the destination line's final quantities.
      for (const status of orderStatus) {
        await orderStatusService.forceUpdateOrderItemStatusQty({
          orderItemId: newItemId,
          status: status.status,
          qty: status.quantity,
        });
      }
    }

    // Freeze EVERY destination line's discount (its own pre-merge amount plus
    // whatever moved in), then recalc once. This is what stops the destination
    // order's maxQty pass from re-rationing discounts across lines after a merge
    // — nothing that was discounted loses it, nothing full-price gains it.
    const destLinesNow = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: destinationOrder.order_id! });
    for (const line of destLinesNow) {
      const frozen =
        (destBefore.get(line.order_detail_id)?.discount ?? 0) +
        (movedIntoLine.get(line.order_detail_id) ?? 0);
      await setTransferDiscount(line.order_detail_id, frozen, user, trx);
    }
    await recalcOrder(destinationOrder.order_id!, trx);

    // Check if the source order has any remaining items after the transfer
    const remainingItems = await getOrderItems(sourceOrder.order_id!, trx);
    const hasRemainingItems = remainingItems?.some((item) =>
      item.status.some((status) => (status.qty || 0) > 0),
    );

    if (!hasRemainingItems) {
      // Delete the source order since all items have been transferred
      await orderService.delete(sourceOrder.order_id!);

      // Mark source table as needing cleaning (available for new customers)
      await trx.update("restaurant_tables", { id: sourceTableId }, { status: "cleaning" });
    } else {
      // Partial merge: freeze what stayed behind so the source table's other
      // lines don't absorb the budget the moved units freed up.
      await freezeSourceLeftovers(sourceOrder.order_id!, sourceBefore, user, trx);
    }

    return destinationOrder.order_id!;
  });
}

async function getDraftOrderByTableId(
  tableId: string,
  warehouseId: string,
  tx: Db,
) {
  const draftOrder = await tx.row<table_customer_order>("customer_order", { AND: [{ table_number: tableId }, { order_status: "DRAFT" }, { warehouse_id: warehouseId }] });
  return draftOrder;
}

async function transferTable(
  orderId: string,
  fromTableId: string,
  toTableId: string,
  tx: Db,
  user: UserInfo,
  transferDiscount: boolean,
) {
  return await tx.tx(async (trx) => {
    await new ChangeTableService(trx, user).change({ requestId: generateId(), orderId, fromTableId, toTableId });

    // Whole-order move keeps every line and quantity, so discounts ride along
    // unchanged. Only act when the user opted out: clear each line's discount.
    if (!transferDiscount) {
      const lines = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });
      for (const line of lines) {
        await setTransferDiscount(line.order_detail_id, 0, user, trx);
      }
      const first = lines[0];
      if (first) {
        const detail = await trx.row<table_customer_order_detail>("customer_order_detail", { order_detail_id: first.order_detail_id });
        if (detail) await recalculateCustomerOrder(detail, trx);
      }
    }
    return orderId;
  });
}

async function getTableInfo(tableId: string, tx: Db) {
  const tableInfo = await tx.row<table_restaurant_tables>("restaurant_tables", { id: tableId });
  return tableInfo;
}

async function getOrderItems(orderId: string, tx: Db) {
  const orderItems = await tx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });
  if (orderItems.length === 0) {
    return null;
  }

  // get order items status
  const orderItemStatuses = await tx.rows<table_order_item_status>("order_item_status", { order_item_id: { in: [...orderItems.map((item) => item.order_detail_id)] } });
  return orderItems.map((item) => ({
    item: item,
    status: orderItemStatuses.filter(
      (status) => status.order_item_id === item.order_detail_id,
    ),
  }));
}

async function getOrder(orderId: string, tx: Db) {
  const order = await tx.row<table_customer_order>("customer_order", { order_id: orderId });
  return order;
}

/** The client's selection, refused when it isn't in the order (e.g. the screen was out of date). */
function checkedItems(
  original: NonNullable<Awaited<ReturnType<typeof getOrderItems>>>,
  selected: OrderItem[],
): OrderItem[] {
  const seen = new Set<string>();
  const stale = () => new HttpError(409, "The order has changed. Refresh and try again.");
  for (const s of selected) {
    const line = original.find((o) => o.item.order_detail_id === s.orderItemId);
    if (!line || line.item.variant_id !== s.variantId || seen.has(s.orderItemId)) throw stale();
    seen.add(s.orderItemId);
    const statuses = new Set<string>();
    for (const st of s.orderItemStatuses) {
      const have = Number(line.status.find((x) => x.status === st.status)?.qty ?? 0);
      if (st.quantity > have || statuses.has(st.status)) throw stale();
      statuses.add(st.status);
    }
  }
  return selected;
}

function isExactMatch(
  originalItems: OrderItem[],
  toTransferItems: OrderItem[],
): boolean {
  if (originalItems.length !== toTransferItems.length) {
    return false;
  }

  for (const originalItem of originalItems) {
    const matchingItem = toTransferItems.find(
      (item) => item.orderItemId === originalItem.orderItemId,
    );
    if (!matchingItem) {
      return false;
    }
    const totalOriginalQty = originalItem.orderItemStatuses.reduce(
      (total, status) => total + (status.quantity || 0),
      0,
    );
    const totalMatchingQty = matchingItem.orderItemStatuses.reduce(
      (total, status) => total + (status.quantity || 0),
      0,
    );
    if (totalOriginalQty !== totalMatchingQty) {
      return false;
    }
  }

  return true;
}

function isOrderItemModifierSame(
  originalModifiers: table_order_detail_modifier[],
  toCheckModifiers: table_order_detail_modifier[],
): boolean {
  if (originalModifiers.length !== toCheckModifiers.length) {
    return false;
  }

  const sortedOriginal = [...originalModifiers].sort(
    (a, b) => a.order_detail_id?.localeCompare(b.modifier_item_id ?? "") ?? 0,
  );
  const sortedToCheck = [...toCheckModifiers].sort(
    (a, b) => a.order_detail_id?.localeCompare(b.modifier_item_id ?? "") ?? 0,
  );

  for (let i = 0; i < sortedOriginal.length; i++) {
    if (
      sortedOriginal[i].modifier_item_id !== sortedToCheck[i].modifier_item_id
    ) {
      return false;
    }
    if (
      sortedOriginal[i].modifier_item_id ===
        sortedToCheck[i].modifier_item_id &&
      sortedOriginal[i].order_detail_id === "notes"
    ) {
      if (sortedOriginal[i].notes !== sortedToCheck[i].notes) {
        return false;
      }
      if (sortedOriginal[i].price !== sortedToCheck[i].price) {
        return false;
      }
    }
  }

  return true;
}

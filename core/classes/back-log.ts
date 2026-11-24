// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import {
  table_backlog_orders,
  table_fulfilment_detail,
  table_inventory,
} from "../generated/tables";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import { SlotMovementService } from "./slot-movement";
import { generateId } from "../lib/generate-id";
import { LoaderFactory } from "../dataloader/loader-factory";
import { Formatter } from "../lib/formatter";
import { Slot } from "../dataloader/slot-loader";
import { ProductVariantType } from "../dataloader/product-variant-loader";

export interface BacklogOrder {
  id: string;
  orderId: string;
  slot: Slot | null;
  variant: ProductVariantType | null;
  qty: number;
  createdAt: string;
  createdBy: UserInfo | null;
}

export class BacklogService {
  constructor(
    protected tx: Db,
    protected user: UserInfo,
  ) {}

  async backLogOrderList(limit: number, offset: number) {
    const query = this.tx
      .table("backlog_orders")
      .innerJoin(
        "warehouse_slot",
        "backlog_orders.slot_id",
        "warehouse_slot.id",
      )
      .where("warehouse_slot.warehouse_id", this.user.currentWarehouseId!)
      .orderBy("backlog_orders.created_at", "desc");

    const { total } = await query
      .clone()
      .count("* as total")
      .first<{ total: number }>();

    const backlogOrders = await query
      .limit(limit)
      .offset(offset)
      .select("backlog_orders.*");

    const slotLoader = LoaderFactory.slotLoader(this.tx);
    const productVariantLoader = LoaderFactory.productVariantByIdLoader(
      this.tx,
      this.user.currentWarehouseId!,
    );
    const userLoader = LoaderFactory.userLoader(this.tx);
    const data = await Promise.all(
      backlogOrders.map(async (backlog) => {
        return {
          id: backlog.id,
          orderId: backlog.order_id,
          slot: backlog.slot_id ? await slotLoader.load(backlog.slot_id) : null,
          variant: backlog.variant_id
            ? await productVariantLoader.load(backlog.variant_id)
            : null,
          qty: backlog.qty,
          createdAt: Formatter.dateTime(backlog.created_at),
          createdBy: backlog.created_by
            ? await userLoader.load(backlog.created_by)
            : null,
        } as BacklogOrder;
      }),
    );
    return {
      data,
      total,
    };
  }

  async resolveBacklog(backlogId: string) {
    return await this.tx.tx(async (tx) => {
      const backlog = await tx.row("backlog_orders", { id: backlogId });

      if (!backlog) {
        throw new Error("Backlog not found");
      }

      const movementService = new SlotMovementService(tx);

      // check if there is enough stock
      const stockAvailable = await tx.rows<table_inventory>("inventory", { AND: [{ slot_id: backlog.slot_id }, { variant_id: backlog.variant_id }, { qty: { gte: backlog.qty } }] });

      let transactionIds: string[] = [];

      if (stockAvailable?.length === 0) {
        throw new Error("Not enough stock available");
      }
      // get fullfilled detail by backlog id
      const fulfilledDetail: table_fulfilment_detail = await tx.row<table_fulfilment_detail>("fulfilment_detail", { transaction_id: backlogId });

      if (!fulfilledDetail) {
        throw new Error("Fulfilled detail not found");
      }

      // deduct stock and create inventory transaction
      transactionIds = await movementService.stockout({
        slotId: backlog.slot_id,
        variantId: backlog.variant_id!,
        qty: backlog.qty,
        createdBy: this.user,
        transactionType: "SALE",
        fallbackBacklogOrder: true,
        referenceOrderItemId: fulfilledDetail.order_detail_id!,
      });

      const fulfilmentDetail = transactionIds.map((transactionId) => {
        return {
          id: generateId(),
          fulfilment_id: fulfilledDetail.fulfilment_id,
          transaction_id: transactionId,
          order_detail_id: fulfilledDetail.order_detail_id!,
        } as table_fulfilment_detail;
      });
      // create new fulfilment detail
      await tx.insert("fulfilment_detail", fulfilmentDetail);

      // delete old fulfilment detail
      await tx.del("fulfilment_detail", { transaction_id: backlogId });

      // delete backlog
      await tx.del("backlog_orders", { id: backlogId });

      return true;
    });
  }
}

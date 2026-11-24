// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import { SlotMovementService } from "./slot-movement";
import { generateId } from "../lib/generate-id";
import { Formatter } from "../lib/formatter";
import {
  table_receive_replenishment,
  table_receive_replenishment_detail,
  table_replenishment,
  table_replenishment_items,
} from "../generated/tables";

export interface ReceivedReplenishedItem {
  replenishmentDetailId: string;
  slotId: string;
  lotNumber?: string;
  expiredAt?: string;
  manufacturedAt?: string;
  costPerUnit?: number;
  qty: number;
}

export class ReceiveReplenishment {
  constructor(
    protected db: Db,
    protected replenishmentId: string,
    protected user: UserInfo,
  ) {}

  async receive(data: ReceivedReplenishedItem[]) {
    return this.db.tx(async (tx) => {
      const replenishment = await getReplenishmentInfo(
        this.replenishmentId,
        tx,
      );

      if (replenishment.from_warehouse === this.user.currentWarehouseId) {
        throw new Error("Cannot receive replenishment from the same warehouse");
      }

      // add received items to inventory
      const stockService = new SlotMovementService(tx);

      const receivedId = await createReceivedReplenishment(
        this.replenishmentId,
        this.user.id,
        tx,
      );

      for (const item of data) {
        const replenishmentDetail = await getReplenishmentDetail(
          item.replenishmentDetailId,
          tx,
        );
        if (!replenishmentDetail) {
          throw new Error("Replenishment detail not found");
        }

        const remainingQty =
          Number(replenishmentDetail.sent_qty || 0) -
          Number(replenishmentDetail.received_qty || 0);

        if (item.qty > remainingQty) {
          throw new Error("Received quantity exceeds the order qty");
        }

        const transactionId = await stockService.stockin({
          variantId: replenishmentDetail.product_variant_id!,
          slotId: item.slotId,
          qty: item.qty,
          createdBy: this.user,
          transactionType: "REPLENISHMENT",
          productLot: {
            variantId: replenishmentDetail.product_variant_id!,
            lotNumber: item.lotNumber,
            expiredAt: item.expiredAt,
            costPerUnit: item.costPerUnit,
            manufacturedAt: item.manufacturedAt,
          },
        });

        // create received purchase order detail
        await tx.insert("receive_replenishment_detail", {
            id: generateId(),
            receive_id: receivedId,
            transaction_id: transactionId.transactionId,
          });

        // update replenishment detail
        await updateReceiveReplenishmentDetail(
          replenishmentDetail.replenish_items_id!,
          item.qty,
          tx,
        );
      }

      await updateReplenishment(this.replenishmentId, tx);

      return receivedId;
    });
  }
}
async function updateReplenishment(replenishmentId: string, tx: Db) {
  const hasPendingItems = await tx
    .table<table_replenishment_items>("replenishment_items")
    .where("replenish_id", replenishmentId)
    .whereRaw("COALESCE(received_qty, 0) < sent_qty")
    .first();

  const newStatus = hasPendingItems ? "receiving" : "received";

  await tx.update("replenishment", { replenish_id: replenishmentId }, { status: newStatus });
}

async function updateReceiveReplenishmentDetail(
  replenishmentDetailId: string,
  receivedQty: number,
  tx: Db,
) {
  await tx
    .table<table_replenishment_items>("replenishment_items")
    .where({ replenish_items_id: replenishmentDetailId })
    .update({
      received_qty: tx.raw("COALESCE(received_qty, 0) + ?", receivedQty),
    });
}

async function getReplenishmentDetail(id: string, tx: Db) {
  const replenishmentDetail: table_replenishment_items = await tx.row("replenishment_items", { replenish_items_id: id });

  return replenishmentDetail;
}

async function createReceivedReplenishment(
  replenishedId: string,
  createdBy: string,
  tx: Db,
) {
  const receivedId = generateId();
  await tx.insert("receive_replenishment", {
    id: receivedId,
    replenishment_id: replenishedId,
    created_by: createdBy,
    created_at: Formatter.getNowDateTime(),
  });
  return receivedId;
}

async function getReplenishmentInfo(replenishmentId: string, tx: Db) {
  const replenishment = await tx.row<table_replenishment>("replenishment", { replenish_id: replenishmentId });

  if (!replenishment) {
    throw new Error("Replenishment not found");
  }

  return replenishment;
}

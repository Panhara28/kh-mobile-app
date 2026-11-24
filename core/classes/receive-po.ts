// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import { SlotMovementService } from "./slot-movement";
import { generateId } from "../lib/generate-id";
import { Formatter } from "../lib/formatter";
import {
  table_supplier_purchase_order,
  table_supplier_purchase_order_detail,
} from "../generated/tables";

interface ReceivePurchaseOrderProps {
  receivedItems: ReceivedItem[];
  createdBy: UserInfo;
}

export interface ReceivedItem {
  purchaseOrderDetailId: string;
  slotId: string;
  lotNumber?: string;
  expiredAt?: string;
  manufacturedAt?: string;
  costPerUnit?: number;
  qty: number;
}

export class ReceivePurchaseOrder {
  constructor(
    protected db: Db,
    protected purchaseOrderId: string,
  ) {}

  async receive({ receivedItems, createdBy }: ReceivePurchaseOrderProps) {
    return this.db.tx(async (tx) => {
      // add received items to inventory
      const stockService = new SlotMovementService(tx);

      const receivedId = await createReceivedPurchaseOrder(
        this.purchaseOrderId,
        createdBy.id,
        tx,
      );

      for (const item of receivedItems) {
        const purchaseOrderDetail = await getPurchaseOrderDetail(
          item.purchaseOrderDetailId,
          tx,
        );
        if (!purchaseOrderDetail) {
          throw new Error("Purchase order detail not found");
        }

        const remainingQty =
          Number(purchaseOrderDetail.quantity || 0) -
          Number(purchaseOrderDetail.received_qty || 0);

        if (item.qty > remainingQty) {
          throw new Error("Received quantity excess the order qty");
        }

        const transactionId = await stockService.stockin({
          variantId: purchaseOrderDetail.product_variant_id,
          slotId: item.slotId,
          qty: item.qty,
          createdBy,
          transactionType: "PURCHASE",
          productLot: {
            variantId: purchaseOrderDetail.product_variant_id,
            lotNumber: item.lotNumber,
            expiredAt: item.expiredAt,
            costPerUnit: item.costPerUnit,
            manufacturedAt: item.manufacturedAt,
          },
        });

        // create received purchase order detail
        await tx.insert("receive_po_detail", {
          id: generateId(),
          receive_id: receivedId,
          transaction_id: transactionId.transactionId,
        });

        // update purchase order detail
        await updateReceivePurchaseOrderDetail(
          purchaseOrderDetail.id!,
          item.qty,
          tx,
        );
      }

      await updatePurchaseOrder(this.purchaseOrderId, tx);

      return receivedId;
    });
  }
}
async function updatePurchaseOrder(purchaseOrderId: string, tx: Db) {
  await tx
    .table<table_supplier_purchase_order>("supplier_purchase_order")
    .where("id", purchaseOrderId)
    .whereNotExists(function () {
      this.select("id")
        .from("supplier_purchase_order_detail")
        .where("supplier_purchase_order_id", purchaseOrderId)
        .whereRaw("COALESCE(received_qty, 0) < quantity");
    })
    .update({ status: "completed" });
}

async function updateReceivePurchaseOrderDetail(
  purchaseOrderDetailId: string,
  receivedQty: number,
  tx: Db,
) {
  await tx
    .table<table_supplier_purchase_order_detail>(
      "supplier_purchase_order_detail",
    )
    .where("id", purchaseOrderDetailId)
    .update({
      received_qty: tx.raw("COALESCE(received_qty, 0) + ?", receivedQty),
    });

  // Update status if remaining quantity is zero
  await tx.table("supplier_purchase_order_detail")
    .where("id", purchaseOrderDetailId)
    .whereRaw("(quantity - COALESCE(received_qty, 0)) = 0")
    .update({ status: "received" });
}

async function getPurchaseOrderDetail(id: string, tx: Db) {
  const purchaseOrderDetail: table_supplier_purchase_order_detail = await tx.row("supplier_purchase_order_detail", { id: id });

  return purchaseOrderDetail;
}

async function createReceivedPurchaseOrder(
  purchaseOrderId: string,
  createdBy: string,
  tx: Db,
) {
  const receivedId = generateId();
  await tx.insert("receive_po", {
    id: receivedId,
    po_Id: purchaseOrderId,
    created_by: createdBy,
    created_at: Formatter.getNowDateTime(),
  });
  return receivedId;
}

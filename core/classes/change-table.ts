// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { z } from "zod";
import type { Db } from "../db/db";
import { table_customer_order, table_restaurant_tables, table_table_change_log } from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { generateId } from "../lib/generate-id";
import { HttpError } from "../lib/server-functions/customer-scope";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import { PrintToKitchenService } from "./print-to-kitchen";
import { getTableMode, refreshTableStatus } from "./table-mode";

export const changeTableSchema = z.object({
  /** Made by the client: the same request sent twice moves the order once. */
  requestId: z.string().min(8).max(64),
  orderId: z.string().min(1),
  /** Where the client saw the order; refused if someone else moved it meanwhile. */
  fromTableId: z.string().min(1),
  toTableId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});
export type ChangeTableInput = z.infer<typeof changeTableSchema>;

export interface TableChange {
  id: string;
  orderId: string;
  invoiceNo: number | null;
  tagNo: string | null;
  fromTableId: string;
  fromTableName: string;
  toTableId: string;
  toTableName: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  reason: string | null;
}
export interface ChangeTableResult extends TableChange {
  /** Kitchen "table changed" tickets queued by this move. */
  tickets: number;
}

/** The only place that moves an open order to another table. The order, its tag and its lines stay the same. */
export class ChangeTableService {
  constructor(
    protected db: Db,
    protected user: UserInfo,
  ) {}

  async change(input: ChangeTableInput): Promise<ChangeTableResult> {
    const warehouseId = this.user.currentWarehouseId!;
    return this.db.tx(async (tx) => {
      const done = await tx.row<table_table_change_log>("table_change_log", { request_id: input.requestId });
      if (done) {
        if (done.warehouse_id !== warehouseId || done.order_id !== input.orderId || done.to_table_id !== input.toTableId) {
          throw new HttpError(409, "This request was already used for another change");
        }
        return { ...toChange(done), tickets: 0 };
      }

      const order = await tx.row<table_customer_order>("customer_order", { order_id: input.orderId, warehouse_id: warehouseId });
      if (!order) throw new HttpError(404, "Order not found");
      if (order.order_status !== "DRAFT") throw new HttpError(409, "This order is already closed");
      if (input.toTableId === input.fromTableId) throw new HttpError(400, "The order is already on this table");
      if (order.table_number !== input.fromTableId) {
        throw new HttpError(409, "This order was moved by someone else. Refresh and try again.");
      }

      const tables = await tx.rows<table_restaurant_tables>("restaurant_tables", {
        id: { in: [input.fromTableId, input.toTableId] },
        warehouse_id: warehouseId,
      });
      const from = tables.find((t) => t.id === input.fromTableId);
      const to = tables.find((t) => t.id === input.toTableId && !t.deleted_at);
      if (!to) throw new HttpError(404, "Destination table not found");

      if ((await getTableMode(tx, warehouseId)).mode === "NORMAL") {
        const occupied = await tx.row("customer_order", { table_number: to.id, order_status: "DRAFT" });
        if (occupied) throw new HttpError(409, "This table already has an open order");
      }

      await tx.update("customer_order", { order_id: order.order_id }, {
        table_number: to.id,
        updated_at: Formatter.getNowDateTime(),
      });
      await refreshTableStatus(tx, to.id, "cleaning");
      if (from) await refreshTableStatus(tx, from.id, "cleaning");

      const log: table_table_change_log = {
        id: generateId(),
        request_id: input.requestId,
        warehouse_id: warehouseId,
        order_id: order.order_id,
        invoice_no: order.invoice_no === null ? null : Number(order.invoice_no),
        tag_no: order.tag_no ?? null,
        from_table_id: input.fromTableId,
        from_table_name: from?.table_name ?? "",
        to_table_id: to.id,
        to_table_name: to.table_name,
        changed_by: this.user.id,
        changed_by_name: this.user.fullname || this.user.username || "",
        changed_at: Formatter.getNowDateTime(),
        reason: input.reason || null,
      };
      await tx.insert("table_change_log", log);

      const tickets = await new PrintToKitchenService(tx, this.user).printTableChange(order, log.from_table_name, log.to_table_name);
      return { ...toChange(log), tickets };
    });
  }

  async history(orderId: string): Promise<TableChange[]> {
    const rows = await this.db.query<table_table_change_log>(
      "SELECT * FROM table_change_log WHERE order_id = ? AND warehouse_id = ? ORDER BY changed_at, rowid",
      [orderId, this.user.currentWarehouseId],
    );
    return rows.map(toChange);
  }
}

function toChange(r: table_table_change_log): TableChange {
  return {
    id: r.id,
    orderId: r.order_id,
    invoiceNo: r.invoice_no === null ? null : Number(r.invoice_no),
    tagNo: r.tag_no,
    fromTableId: r.from_table_id,
    fromTableName: r.from_table_name,
    toTableId: r.to_table_id,
    toTableName: r.to_table_name,
    changedBy: r.changed_by,
    changedByName: r.changed_by_name,
    changedAt: r.changed_at,
    reason: r.reason,
  };
}

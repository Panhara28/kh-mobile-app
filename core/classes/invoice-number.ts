// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import moment from "moment-timezone";

export class InvoiceNumberService {
  constructor(
    protected db: Db,
    protected user: UserInfo,
  ) {}

  async getNextInvoiceNumber(
    n: number,
    forceReset?: boolean,
    date?: string,
  ): Promise<number[]> {
    const setting = await this.db.row("setting", { AND: [{ option: "INVOICE_RECEIPT" }, { warehouse: this.user.currentWarehouseId }] });
    if (setting) {
      const invoiceSetting = setting.value.split(",");
      const config = Number(invoiceSetting.at(6) || "0");
      const query = this.db
        .table("customer_order")
        .whereNotNull("invoice_no")
        .where("warehouse_id", this.user.currentWarehouseId)
        .orderBy("invoice_no", "desc");

      if (!!forceReset && date) {
        query.whereRaw("DATE(created_at) = ?", [date]);
      }

      if (config === 0) {
        query.whereRaw("DATE(created_at) = ?", [
          date ? date : moment().format("YYYY-MM-DD"),
        ]);
      }

      const invoice = await query.clone().select().first();
      console.log("Last Invoice:", invoice);
      const lastNumber = invoice?.invoice_no || 0;
      const lastDate = String(lastNumber).substring(0, 8);
      const currentDate = moment(date ? date : new Date()).format("YYYYMMDD");

      // If config = 0: reset by day, else continue without reset
      let count = 0;

      if (!!forceReset) {
        if (lastDate === currentDate) {
          count = Number(String(lastNumber).substring(8));
        }
      } else {
        if (config === 0) {
          if (lastDate === currentDate) {
            count = Number(String(lastNumber).substring(8));
          }
        } else {
          count = Number(String(lastNumber).substring(8));
        }
      }

      const suggestedNumber: number[] = [];
      let i = 1;
      while (n > 0) {
        const invoiceNo = currentDate + String(count + i).padStart(5, "0");
        const order = await this.db.row("customer_order", { AND: [{ invoice_no: invoiceNo }, { warehouse_id: this.user.currentWarehouseId }] });
        // a taken number is skipped (it used to be handed out anyway and the insert then failed)
        if (!order) {
          suggestedNumber.push(Number(invoiceNo));
          n--;
        }
        i++;
      }
      return suggestedNumber;
    }

    return [];
  }
}

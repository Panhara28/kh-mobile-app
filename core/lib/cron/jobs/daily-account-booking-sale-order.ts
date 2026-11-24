// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { CronLogger } from "../cron-logger";
import moment from "moment-timezone";
import { getKnexSync } from "../../knex";
import { querySaleOrderReport } from "../helpers/sale-order-report";
import { generateId } from "../../generate-id";
import {
  table_account_booking,
  table_user,
} from "../../../generated/tables";
import { Formatter } from "../../../lib/formatter";

const logger = new CronLogger("DailyAccountBookingSaleOrderJob");

/**
 * Testable job function - can be called directly for testing
 */
export async function testDailyAccountBookingSaleOrderJob() {
  logger.info("Starting daily account booking sale order report generation...");

  const today = moment().tz("Asia/Phnom_Penh");

  const pastday = today.subtract(1, "day").format("YYYY-MM-DD");

  const db = getKnexSync();

  logger.info(`Querying account booking sale order data on ${pastday}...`);

  const result = await db.tx(async (trx) => {
    const reportData = await querySaleOrderReport(trx, {
      startDate: pastday,
      endDate: `${pastday} 23:59:59`,
      // startDate: "2026-03-31",
      // endDate: `2026-03-31 23:59:59`,
    });

    logger.info(`Found ${reportData.length} sale order records`);

    if (reportData.length === 0) {
      logger.warn("⚠️  No sale order data found for the specified date range");
      return {
        totalSaleOrders: 0,
        skipped: true,
      };
    }

    const rows: table_account_booking[] = [];
    const account = await trx.row("chart_of_account", { account_name: "Sale Order" });

    const accountId = account ? account.id : generateId();

    if (!account) {
      await db.insert("chart_of_account", {
        id: accountId,
        account_name: "Sale Order",
        created_at: today.format("YYYY-MM-DD HH:mm:ss"),
        created_by: "cron-job",
        account_type: "revenue",
      });
    }

    for (const row of reportData) {
      const systemAdmin: table_user = await trx.row("user", { AND: [{ is_system_admin: true }, { warehouse_id: row.warehouse_id }, { is_dev: false }, { is_deleted: 0 }] });
      const date = Formatter.date(row.paid_date);
      rows.push({
        id: generateId(),
        account_id: accountId,
        created_at: date,
        created_by: systemAdmin.id || "",
        description: `Sale Order ${date} (${row.name})`,
        amount: String(row.total_amount),
        warehouse_id: row.warehouse_id,
        deleted_at: null,
        deleted_by: null,
      });
    }

    logger.info(`Inserted ${rows.length} account booking records`);

    await trx.insert("account_booking", rows);

    logger.info(`Successfully inserted ${rows.length} account booking records`);

    return {
      total: rows.length,
    };
  });

  return result;
}

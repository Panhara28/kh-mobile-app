// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getKnexSync } from "../../knex";
import { CronLogger } from "../cron-logger";
import { queryMovieShowtimeData } from "../helpers/movie-showtime-report";
import moment from "moment-timezone";
import { generateId } from "../../generate-id";
import {
  table_account_booking,
  table_user,
} from "../../../generated/tables";
import { Formatter } from "../../../lib/formatter";

interface AccountBooking extends table_account_booking {
  key: string;
}

const logger = new CronLogger("DailyAccountBookingMovieShowtimeJob");

/**
 * Testable job function - can be called directly for testing
 */
export async function testDailyAccountBookingMovieShowtimeJob() {
  logger.info(
    "Starting daily account booking movie showtime report generation...",
  );
  const today = moment().tz("Asia/Phnom_Penh");

  const pastday = today.subtract(1, "day").format("YYYY-MM-DD");

  const db = getKnexSync();

  logger.info(`Querying account booking movie showtime data on ${pastday}...`);

  const result = await db.tx(async (trx) => {
    const reportData = await queryMovieShowtimeData(trx, {
      startDate: pastday,
      endDate: `${pastday} 23:59:59`,
    });

    logger.info(`Found ${reportData.length} showtime records`);

    if (reportData.length === 0) {
      logger.warn("⚠️  No showtime data found for the specified date range");
      return {
        totalShowtimes: 0,
        skipped: true,
      };
    }

    const rows: AccountBooking[] = [];
    const account = await trx.row("chart_of_account", { account_name: "Sale Ticket" });

    const accountId = account ? account.id : generateId();

    if (!account) {
      await db.insert("chart_of_account", {
        id: accountId,
        account_name: "Sale Ticket",
        created_at: today.format("YYYY-MM-DD HH:mm:ss"),
        created_by: "cron-job",
        account_type: "revenue",
      });
    }

    for (const showtime of reportData.filter((s) => s.booking_id === null)) {
      const date = Formatter.date(showtime.show_date);
      const description = `Sale Ticket ${showtime.title} ${date}`;

      const findIndex = rows.findIndex((f) => f.description === description);

      let amount = Number(showtime.price);

      if (Number(showtime.tax_rate) > 0) {
        amount = amount / 1.1; // tax_rate is 10%
      }

      const key =
        findIndex >= 0
          ? rows[findIndex].key + "," + showtime.showtime_id
          : showtime.showtime_id;

      const systemAdmin: table_user = await trx.row("user", { AND: [{ is_system_admin: true }, { warehouse_id: showtime.warehouse_id }, { is_dev: false }, { is_deleted: 0 }] });

      if (findIndex === -1) {
        rows.push({
          id: generateId(),
          account_id: accountId,
          created_by: systemAdmin.id || "",
          created_at: date,
          description,
          amount: String(amount),
          key,
          warehouse_id: showtime.warehouse_id,
          deleted_at: null,
          deleted_by: null,
        });
      } else {
        rows[findIndex].amount = String(
          Number(rows[findIndex].amount) + amount,
        );
      }
    }

    logger.info(
      `Processed Rows for Account Booking: ${rows.map((r) => r.description + " - " + r.amount).join("\n")}`,
    );

    await trx.table("account_booking").insert(
      rows.map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key, ...rest } = r;
        return rest;
      }),
    );

    logger.info("Updating showtime records with booking IDs...");

    for (const row of rows) {
      await trx.update("showtime", { showtime_id: { in: [...row.key.split(",")] } }, {
          booking_id: row.id,
        });
    }

    return {
      totalShowtimes: rows.length,
    };
  });

  return result;
}

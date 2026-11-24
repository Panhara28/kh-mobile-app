// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getKnexSync } from "../../knex";
import { CronLogger } from "../cron-logger";
import {
  generateMovieShowtimeHtml,
  groupByMovieHallBranch,
  queryMovieShowtimeData,
} from "../helpers/movie-showtime-report";
import { PdfGenerator } from "../../pdf-generator";
import { Email } from "../../email/email-service";
import moment from "moment-timezone";

const logger = new CronLogger("DailyMovieShowtimeReportJob");

/**
 * Testable job function - can be called directly for testing
 */
export async function testDailyMovieShowtimeReportJob(date?: string) {
  logger.info("Starting daily movie showtime report generation...");
  const today = moment().tz("Asia/Phnom_Penh");

  const pastday = date
    ? moment(date).format("YYYY-MM-DD")
    : today.subtract(1, "day").format("YYYY-MM-DD");

  const db = getKnexSync();

  logger.info("Querying movie showtime data...");
  const rows = await queryMovieShowtimeData(db, {
    startDate: pastday,
    endDate: `${pastday} 23:59:59`,
  });

  const reportData = groupByMovieHallBranch(rows);

  logger.info(`Found ${reportData.length} showtime records`);

  // console.log("Report Data:", reportData);

  if (reportData.length === 0) {
    logger.warn("⚠️  No showtime data found for the specified date range");
    return {
      totalShowtimes: 0,
      skipped: true,
    };
  }

  // Check if we should skip email (useful for testing)
  const skipEmail = process.env.SKIP_EMAIL === "true";

  if (!skipEmail) {
    const recipientEmail = reportData
      .map((item) => item.email_producer.split(",").flat())
      .flat();

    const uniqueEmails = [...new Set(recipientEmail)];

    console.log("Recipient Emails:", uniqueEmails);
    const currentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    logger.info(`Sending report to ${uniqueEmails}...`);

    for (const email of uniqueEmails) {
      const data = reportData.filter((item) =>
        item.email_producer.split(",").includes(email),
      );

      if (data.length > 0) {
        // Generate HTML for PDF
        const html = generateMovieShowtimeHtml(data, pastday);

        // Generate PDF from HTML
        logger.info("Generating PDF...");
        const pdfPath = await PdfGenerator.generateFromHtml(
          html,
          {
            format: "A4",
            margin: {
              top: "0mm",
              bottom: "0mm",
              left: "0mm",
              right: "0mm",
            },
            landscape: true,
          },
          pastday,
        );
        logger.info(`PDF generated successfully at: ${pdfPath}`);
        // Send email with PDF attachment
        // default email if email is null or empty 2keppere@gmail.com
        await Email.sendMailgunWithAttachments(
          email === "null" ? "2keppere@gmail.com" : email,
          `Daily Movie Showtime Report - ${currentDate}`,
          "Please find attached the daily movie showtime report.",
          [
            {
              filename: `movie-showtime-report-${currentDate}.pdf`,
              path: pdfPath,
            },
          ],
        );
      }
    }
    logger.info("✓ Daily product report sent successfully");
  } else {
    logger.info("⏭️  Skipping email (set SKIP_EMAIL=true)");
  }

  return {
    totalShowtimes: reportData.length,
  };
}

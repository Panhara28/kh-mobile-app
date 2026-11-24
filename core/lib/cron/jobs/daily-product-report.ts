// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getKnexSync } from "../../knex";
import { CronLogger } from "../cron-logger";
import { Email } from "../../email/email-service";
import { PdfGenerator } from "../../pdf-generator";
import {
  queryProductListData,
  generateProductListHtml,
  generateProductReportEmail,
} from "../helpers/product-list-report";

const logger = new CronLogger("DailyProductReportJob");

/**
 * Testable job function - can be called directly for testing
 */
export async function testDailyProductReportJob() {
  logger.info("Starting daily product report generation...");

  const db = getKnexSync();

  // Query product data from database
  logger.info("Querying product data...");
  const reportData = await queryProductListData(db);
  logger.info(
    `Found ${reportData.summary.totalProducts} products with ${reportData.summary.totalVariants} variants`,
  );

  if (reportData.items.length === 0) {
    logger.warn("⚠️  No products found in database");
    return {
      totalProducts: 0,
      totalVariants: 0,
      totalStock: 0,
      skipped: true,
    };
  }

  // Generate HTML for PDF
  const html = generateProductListHtml(reportData);

  // Generate PDF from HTML
  logger.info("Generating PDF...");
  const pdfPath = await PdfGenerator.generateFromHtml(html, {
    format: "A4",
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm",
    },
  });
  logger.info(`PDF generated successfully at: ${pdfPath}`);

  // Generate email HTML
  const emailHtml = generateProductReportEmail(reportData);

  // Check if we should skip email (useful for testing)
  const skipEmail = process.env.SKIP_EMAIL === "true";

  if (!skipEmail) {
    // Send email with PDF attachment
    const recipientEmail = "2keppere@gmail.com";
    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    logger.info(`Sending report to ${recipientEmail}...`);

    await Email.sendMailgunWithAttachments(
      recipientEmail,
      `Daily Product Inventory Report - ${currentDate}`,
      emailHtml,
      [
        {
          filename: `product-list-${new Date().toISOString().split("T")[0]}.pdf`,
          path: pdfPath,
        },
      ],
    );

    logger.info("✓ Daily product report sent successfully");
  } else {
    logger.info("⏭️  Skipping email (set SKIP_EMAIL=true)");
    logger.info(`📄 PDF saved at: ${pdfPath}`);
  }

  // Return metadata for database logging
  return {
    totalProducts: reportData.summary.totalProducts,
    totalVariants: reportData.summary.totalVariants,
    totalStock: reportData.summary.totalStock,
    recipientEmail: skipEmail ? null : "2keppere@gmail.com",
    pdfGenerated: true,
    pdfPath,
    emailSent: !skipEmail,
  };
}

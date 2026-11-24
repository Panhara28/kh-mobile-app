// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getKnexSync } from "../../knex";
import { CronLogger } from "../cron-logger";

const logger = new CronLogger("TestDatabaseJob");

/**
 * Testable job function - can be called directly for testing
 */
export async function testTestDatabaseJob() {
  const db = getKnexSync();

  // Simple query to test database connection
  const result = await db.table("product")
    .whereNull("deleted_at")
    .count("id as total")
    .first();

  const totalProducts = Number(result?.total || 0);

  logger.info(`✓ Database test successful - Total products: ${totalProducts}`);

  // Optional: Query more data to verify connection
  const recentProducts = await db.rows("product", { deleted_at: null }, { orderBy: [{ created_at: "desc" }], take: 3, select: ["id","title"] });

  if (recentProducts.length > 0) {
    logger.info(
      `Recent products: ${recentProducts.map((p) => p.title).join(", ")}`,
    );
  }

  // Return metadata for database logging
  return {
    recordsProcessed: totalProducts,
    recentProductsChecked: recentProducts.length,
    productNames: recentProducts.map((p) => p.title),
  };
}

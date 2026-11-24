// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import ProductImageRepository, {
  ProductImage,
} from "../repository/product-image-repository";
import Dataloader from "../db/loader";
import type { Db } from "../db/db";
import { headers } from "../next-compat/request-context";

export function createProductImageLoader(db: Db) {
  return new Dataloader(async (keys: readonly string[]) => {
    const rows = await new ProductImageRepository(db).findByProductIds(keys);
    const headerList = await headers();
    const hostname = headerList.get("host")?.split(":")[0];
    const images = await Promise.all(
      rows.map((row) => ProductImageRepository.map(row, hostname))
    );
    const productImageMap: Record<string, ProductImage[]> = {};
    images.forEach((row) => {
      if (productImageMap[row.productId]) {
        productImageMap[row.productId].push(row);
      } else {
        productImageMap[row.productId] = [row];
      }
    });
    return keys.map((key) => productImageMap[key] || []);
  });
}

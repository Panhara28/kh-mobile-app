// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import ProductImageRepository, {
  ProductImage,
} from "../repository/product-image-repository";
import DataLoader from "../db/loader";
import type { Db } from "../db/db";
import { headers } from "../next-compat/request-context";

export function createVariantImageLoader(db: Db) {
  return new DataLoader(async (keys: readonly string[]) => {
    const rows = await new ProductImageRepository(db).findByVariantIds(keys);
    const headerList = await headers();
    const hostname = headerList.get("host")?.split(":")[0];
    const images = await Promise.all(
      rows.map((row) => ProductImageRepository.map(row, hostname))
    );
    const variantImageMap: Record<string, ProductImage[]> = {};
    images.forEach((row) => {
      if (variantImageMap[row.productVariantId!]) {
        variantImageMap[row.productVariantId!].push(row);
      } else {
        variantImageMap[row.productVariantId!] = [row];
      }
    });
    return keys.map((key) => variantImageMap[key] || []);
  });
}

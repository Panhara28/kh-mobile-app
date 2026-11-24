// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { table_product_variant } from "../generated/tables";
import { computeVariantDiscount } from "../lib/variant-discount";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import DataLoader from "../db/loader";
import { inList, type Db } from "../db/db";
import { BasicProductType } from "./basic-product-loader";
import { CompositeVariant } from "./composite-variant-loader";
import { LoaderFactory } from "./loader-factory";
import { MovieInput } from "../classes/movie";

export interface ProductModifierItemType {
  id: string;
  modifierId: string;
  name: string;
  price?: number;
  createdAt?: string;
  createdBy?: UserInfo | null;
}

export interface ProductModifierType {
  modifierId: string;
  title: string;
  description: string;
  createdAt?: string;
  createdBy?: UserInfo | null;
  items?: ProductModifierItemType[];
}

export interface ProductVariantType {
  id: string;
  productId: string;
  name: string;
  sku: string | number;
  barcode: string;
  price: number | null;
  purchasePrice: number | null;
  lowStockQty: number | null;
  idealStockQty: number | null;
  stock: number | null;
  discountType?: "AMOUNT" | "PERCENTAGE" | null;
  discountValue?: number | null;
  /** Unit price after the variant menu discount, or null when there is none. */
  discountedPrice?: number | null;
  createdAt: string;
  updatedAt: string;
  optionValues: {
    id: string;
    value: string;
  }[];
  basicProduct?: BasicProductType | null;
  isComposite?: boolean;
  visible: boolean;
  /** Admin-set menu badges; tagged variants sort to the top of their category. */
  isPopular?: boolean;
  isNew?: boolean;
  isMostOrder?: boolean;
  /** Kitchen printer bound to this variant in the branch; null = category's printer. */
  printerId?: string | null;
  compositeVariants?: CompositeVariant[];
  slotStock?: {
    slotId: string;
    slotName: string;
    posSlot: boolean;
    stock: number;
  }[];
  movie: MovieInput | null;
}

export function createProductVariantLoader(
  db: Db,
  warehouseId: string,
  user?: UserInfo,
) {
  return new DataLoader(async (keys: readonly string[]) => {
    const useMainBranchVisibility =
      user && user?.warehouse?.useMainBranchVisibility;
    const branchId = user?.currentWarehouseId || "";

    // Only variants in a (non-deleted) product group assigned to this branch
    const groupFilter = useMainBranchVisibility
      ? `AND product_variant.id IN (
           SELECT product_variant_id FROM group_products
           WHERE group_id IN (SELECT group_id FROM warehouse_groups WHERE warehouse_id = ?)
             AND group_id IN (SELECT group_id FROM product_groups WHERE deleted_at IS NULL))`
      : "";
    const rows = await db.query<table_product_variant>(
      `SELECT product_variant.* FROM product_variant
       WHERE product_variant.product_id IN (${inList(keys)})
         AND product_variant.deleted_at IS NULL AND product_variant.available = 1 ${groupFilter}`,
      useMainBranchVisibility ? [...keys, branchId] : [...keys],
    );
    const variantIds = rows.map((x) => x.id!);

    // Performance: only the visibility rows of the loaded variants are read (they are only looked up by variant).
    // The old query read every visibility row of the branch on each batch unless main-branch visibility was on.
    const [visibilityList, variantPrinters] = await Promise.all([
      variantIds.length > 0
        ? db.query<{
            product_id: string;
            product_variant_id: string;
            is_visible: number | null;
            is_for_sale: number | null;
            is_popular: number | null;
            is_new: number | null;
            is_most_order: number | null;
          }>(
            `SELECT product_id, product_variant_id, is_visible, is_for_sale, is_popular, is_new, is_most_order
             FROM product_warehouse_visibility WHERE warehouse_id = ? AND product_variant_id IN (${inList(variantIds)})`,
            [branchId, ...variantIds],
          )
        : [],
      variantIds.length > 0
        ? db.query<{ variant_id: string; printer_id: string }>(
            `SELECT variant_id, printer_id FROM warehouse_variant_printer WHERE warehouse_id = ? AND variant_id IN (${inList(variantIds)})`,
            [warehouseId, ...variantIds],
          )
        : [],
    ]);

    const variantStockLoader = LoaderFactory.variantStockLoader(
      db,
      warehouseId,
    );

    const basicProductLoader = LoaderFactory.basicProductLoader(db);
    const compositeVariantLoader = LoaderFactory.compositeVariantLoader(
      db,
      warehouseId,
    );

    const variantValue = await getVariantOptionValue(
      db,
      rows.map((x) => x.id!),
    );

    const productVariantMap: Record<string, ProductVariantType[]> = {};

    const movieLoader = LoaderFactory.movieByVariantIDLoader(db);

    await Promise.all(
      rows.map(async (x) => {
        const [variantStock, movie, basicProduct, compositeVariants] =
          await Promise.all([
            x.id ? variantStockLoader.load(x.id) : null,
            x.id ? movieLoader.load(x.id) : null,
            basicProductLoader.load(x.product_id),
            x.is_composite ? compositeVariantLoader.load(x.id ?? "") : undefined,
          ]);

        const optionValues = variantValue
          .filter((v) => v.product_variant_id === x.id)
          .map(({ id, value }) => ({ id, value }));

        const branchVisibility = useMainBranchVisibility
          ? visibilityList.find((v) => v.product_variant_id === x.id)
          : undefined;

        const unitPrice = x.price ? Number(x.price) : null;
        const discountType = x.discount_type ?? null;
        const discountValue =
          x.discount_value != null ? Number(x.discount_value) : null;
        const variantDiscount =
          unitPrice != null
            ? computeVariantDiscount(unitPrice, discountType, discountValue)
            : null;

        const variant: ProductVariantType = {
          id: x.id ?? "",
          productId: x.product_id ?? "",
          name: x.name ?? "",
          sku: x.sku ? x.sku.toString() : "",
          barcode: x.barcode ?? "",
          price: unitPrice,
          purchasePrice: x.purchased_cost ? Number(x.purchased_cost) : null,
          lowStockQty: x.low_stock_qty ? Number(x.low_stock_qty) : null,
          idealStockQty: x.ideal_stock_qty ? Number(x.ideal_stock_qty) : null,
          stock: variantStock?.stock ?? 0,
          discountType,
          discountValue,
          discountedPrice: variantDiscount?.discountedUnitPrice ?? null,
          createdAt: x.created_at ?? "",
          updatedAt: x.updated_at ?? "",
          optionValues,
          basicProduct,
          isComposite: x.is_composite ? Boolean(x.is_composite) : false,
          visible: useMainBranchVisibility
            ? visibilityList.find((v) => v.product_variant_id === x.id)
                ?.is_visible === 1
            : x.visible
              ? Boolean(x.visible)
              : false,
          compositeVariants,
          movie,
          isPopular: resolveBadge(branchVisibility?.is_popular, x.is_popular),
          isNew: resolveBadge(branchVisibility?.is_new, x.is_new),
          isMostOrder: resolveBadge(
            branchVisibility?.is_most_order,
            x.is_most_order,
          ),
          printerId:
            variantPrinters.find((p) => p.variant_id === x.id)?.printer_id ??
            null,
        };

        productVariantMap[x.product_id] = productVariantMap[x.product_id] || [];
        productVariantMap[x.product_id].push(variant);
      }),
    );

    // Sort variants of each product by sku asc
    Object.keys(productVariantMap).forEach((productId) => {
      productVariantMap[productId].sort((a, b) => {
        const skuA = a.sku?.toString() || "";
        const skuB = b.sku?.toString() || "";
        return skuA.localeCompare(skuB, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
    });

    return await Promise.all(keys.map((key) => productVariantMap[key] || []));
  });
}

/**
 * Resolve a menu badge flag: an explicit per-branch override (0 or 1) wins,
 * otherwise fall back to the main warehouse's flag on `product_variant`.
 */
function resolveBadge(
  overrideVal: number | null | undefined,
  mainVal: number | null | undefined,
): boolean {
  return (overrideVal ?? mainVal ?? 0) === 1;
}

export async function getVariantOptionValue(
  tx: Db,
  variantIds: string[],
): Promise<{ product_variant_id: string; id: string; value: string }[]> {
  if (variantIds.length === 0) return [];

  const variantOptions = (await tx.p.product_variant_options.findMany({
    where: { product_variant_id: { in: variantIds } },
    select: { product_variant_id: true, option_value_id: true },
  })) as { product_variant_id: string; option_value_id: string }[];

  const optionValueLoader = LoaderFactory.productOptionValueByIdLoader(tx);
  const optionValues = await Promise.all(
    variantOptions.map((vo) => optionValueLoader.load(vo.option_value_id)),
  );

  // Drop options whose value row is missing, like the previous inner join
  return variantOptions.flatMap((vo, i) => {
    const optionValue = optionValues[i];
    return optionValue
      ? [
          {
            product_variant_id: vo.product_variant_id,
            id: optionValue.id,
            value: optionValue.value as string,
          },
        ]
      : [];
  });
}

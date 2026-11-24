// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../db/db";
import { appliedProductDiscountLoader } from "./applie-discount-loader";
import { createBasicProductLoader } from "./basic-product-loader";
import { createCategoryByProductLoader } from "./category-by-product-loader";
import { createCompositeVariantLoader } from "./composite-variant-loader";
import { createDiscountByOrderItemLoader } from "./discount-by-order-items-loader";
import { createDiscountByProductLoader } from "./discount-by-product-loader";
import { createDiscountLoader } from "./discount-loader";
import {
  createFulfilmentDetailByTransactionIDLoader,
  createFulfilmentLoader,
} from "./fulfilment-loader";
import { createInventoryTransactionLoader } from "./inventory-transaction-loader";
import {
  createModifierItemLoader,
  createModifierLoader,
} from "./modifier-loader";
import { createModifierItemByIdLoader } from "./modifier-item-by-id-loader";
import { createModifierByProductLoader } from "./modifier-product-loader";
import { createOrderDetailLoader } from "./order-detail-loader";
import {
  createOrderLoader,
  createOrderLoaderByCustomerId,
} from "./order-loader";
import { createOrderModifierLoader } from "./order-modifier-loader";
import { createOrderReturnByOrderDetailLoader } from "./order-return-by-order-detail-loader";
import { createOrderStatusItemLoader } from "./order-status-item.loader";
import { createProductCategoryLoader } from "./product-category-loader";
import { createProductImageLoader } from "./product-image-loader";
import { createProductLot } from "./product-lot";
import {
  createProductOptionValueByIdLoader,
  createProductOptionValueLoader,
} from "./product-option-value-loader";
import { createProductVariantByIdLoader } from "./product-variant-by-id-loader";
import { createProductVariantConversionLoader } from "./product-variant-conversion-loader";
import { createProductVariantLoader } from "./product-variant-loader";
import {
  createReceivedPOLoader,
  createSupplierPurchaseOrderLoader,
  receivePOBytransactionIDLoader,
} from "./receive-po-loader";
import { createRoleLoader } from "./role-loader";
import { createSlotLoader } from "./slot-loader";
import { createSupplierLoader } from "./supplier-loader";
import { createUserLoader } from "./user-loader";
import { createVariantImageLoader } from "./variant-image-loader";
import { createVariantSlotStockLoader } from "./variant-slot-stock-loader";
import { createVariantStockLoader } from "./variant-stock-loader";
import { createWarehouseLoader } from "./warehouse-loader";
import { getOrderPaymentLoader } from "./order-payment-loader";
import {
  createCinemaHallLoader,
  createCinemaHallSeatLoader,
  createCinemaSeatLoader,
} from "./cinema-hall-seat-loader";
import { createMovieByVariantIDLoader } from "./movie-loader";
import { createPricingTemplateLoader } from "./pricing-template-loader";
import { createCustomerLoader } from "./customer-loader";
import {
  createCinemaReservationByOrderDetailLoader,
  createCinemaReservationByShowtimeLoader,
} from "./cenima-reservation-loader";
import { createShowtimeLoader } from "./showtime-loader";
import { createChartOfAccountsLoader } from "./chart-of-accounts-loader";
import { createWarehouseGroupByGroupIdLoader } from "./warehouse-group-loader";
import { createGroupProductByGroupIdLoader } from "./group-product-loader";
import {
  createKitchenLogByOrderDetailLoader,
  createKitchenResendByOrderDetailLoader,
} from "./kitchen-log-loader";
import { createPaymentMethodLoader } from "./payment-method-loader";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";

/**
 * One loader per request and arguments: every part of a request that asks for (say) users shares one loader,
 * so their loads are batched into one query. The old factory made a new loader on every call, often per row,
 * which turned nested lookups into N+1 queries. Loaders don't cache (db/loader.ts), so writes are always seen.
 */
const loaders = new WeakMap<Db, Map<string, unknown>>();
function memo<T>(db: Db, key: string, make: () => T): T {
  let m = loaders.get(db);
  if (!m) loaders.set(db, (m = new Map()));
  let l = m.get(key) as T | undefined;
  if (!l) m.set(key, (l = make()));
  return l;
}
function keyOf(...args: unknown[]): string {
  return args
    .map((a) => (a && typeof a === "object" ? String((a as { id?: unknown; currentWarehouseId?: unknown }).id ?? "") + "/" + String((a as { currentWarehouseId?: unknown }).currentWarehouseId ?? "") : String(a)))
    .join("|");
}

export class LoaderFactory {
  static productImageLoader(db: Db) {
    return memo(db, "productImageLoader", () => createProductImageLoader(db));
  }

  static productCategoryLoader(db: Db) {
    return memo(db, "productCategoryLoader", () => createProductCategoryLoader(db));
  }

  static categoryByProductLoader(db: Db) {
    return memo(db, "categoryByProductLoader", () => createCategoryByProductLoader(db));
  }

  static productOptionValueLoader(db: Db) {
    return memo(db, "productOptionValueLoader", () => createProductOptionValueLoader(db));
  }

  static productOptionValueByIdLoader(db: Db) {
    return memo(db, "productOptionValueByIdLoader", () => createProductOptionValueByIdLoader(db));
  }

  static paymentMethodLoader(db: Db) {
    return memo(db, "paymentMethodLoader", () => createPaymentMethodLoader(db));
  }

  /** `withToken` only for the bound-user list; everywhere else a user's login token is not sent out. */
  static userLoader(db: Db, withToken = false) {
    return memo(db, `userLoader:${keyOf(withToken)}`, () => createUserLoader(db, withToken));
  }
  static supplierLoader(db: Db) {
    return memo(db, "supplierLoader", () => createSupplierLoader(db));
  }

  static warehouseLoader(db: Db) {
    return memo(db, "warehouseLoader", () => createWarehouseLoader(db));
  }

  static variantStockLoader(
    db: Db,
    warehouseId: string,
    forReplenishment?: boolean,
  ) {
    return memo(db, `variantStockLoader:${keyOf(warehouseId, forReplenishment)}`, () => createVariantStockLoader(db, warehouseId, forReplenishment));
  }

  static productVariantByIdLoader(db: Db, warehouseId?: string) {
    return memo(db, `productVariantByIdLoader:${keyOf(warehouseId)}`, () => createProductVariantByIdLoader(db, warehouseId));
  }

  static productVariantLoader(db: Db, warehouseId: string, user?: UserInfo) {
    return memo(db, `productVariantLoader:${keyOf(warehouseId, user)}`, () => createProductVariantLoader(db, warehouseId, user));
  }

  static discountLoader(db: Db) {
    return memo(db, "discountLoader", () => createDiscountLoader(db));
  }

  static orderDetailLoader(db: Db, warehouseId: string) {
    return memo(db, `orderDetailLoader:${keyOf(warehouseId)}`, () => createOrderDetailLoader(db, warehouseId));
  }

  static productLotLoader(db: Db) {
    return memo(db, "productLotLoader", () => createProductLot(db));
  }

  static slotLoader(db: Db) {
    return memo(db, "slotLoader", () => createSlotLoader(db));
  }

  static roleLoader(db: Db) {
    return memo(db, "roleLoader", () => createRoleLoader(db));
  }

  static inventoryTransactionLoader(db: Db, warehouseId: string) {
    return memo(db, `inventoryTransactionLoader:${keyOf(warehouseId)}`, () => createInventoryTransactionLoader(db, warehouseId));
  }

  static basicProductLoader(db: Db) {
    return memo(db, "basicProductLoader", () => createBasicProductLoader(db));
  }

  static fulfilmentLoader(db: Db) {
    return memo(db, "fulfilmentLoader", () => createFulfilmentLoader(db));
  }

  static fulfilmentDetailByIDLoader(db: Db) {
    return memo(db, "fulfilmentDetailByIDLoader", () => createFulfilmentDetailByTransactionIDLoader(db));
  }

  static orderLoader(db: Db) {
    return memo(db, "orderLoader", () => createOrderLoader(db));
  }

  static receivePODetailByTrasactionIDLoader(db: Db) {
    return memo(db, "receivePODetailByTrasactionIDLoader", () => receivePOBytransactionIDLoader(db));
  }

  static receivePOLoader(db: Db) {
    return memo(db, "receivePOLoader", () => createReceivedPOLoader(db));
  }

  static supplierPurchaseOrderLoader(db: Db) {
    return memo(db, "supplierPurchaseOrderLoader", () => createSupplierPurchaseOrderLoader(db));
  }

  static variantSlotStockLoader(db: Db, warehouseId: string) {
    return memo(db, `variantSlotStockLoader:${keyOf(warehouseId)}`, () => createVariantSlotStockLoader(db, warehouseId));
  }

  static orderReturnByOrderDetailLoader(db: Db) {
    return memo(db, "orderReturnByOrderDetailLoader", () => createOrderReturnByOrderDetailLoader(db));
  }

  static compositeVariantLoader(db: Db, warehouseId: string) {
    return memo(db, `compositeVariantLoader:${keyOf(warehouseId)}`, () => createCompositeVariantLoader(db, warehouseId));
  }

  static variantImageLoader(db: Db) {
    return memo(db, "variantImageLoader", () => createVariantImageLoader(db));
  }

  static discountByOrderItemLoader(db: Db) {
    return memo(db, "discountByOrderItemLoader", () => createDiscountByOrderItemLoader(db));
  }

  static productVariantConversionLoader(db: Db, warehouseId: string) {
    return memo(db, `productVariantConversionLoader:${keyOf(warehouseId)}`, () => createProductVariantConversionLoader(db, warehouseId));
  }
  static modifierByProductLoader(db: Db) {
    return memo(db, "modifierByProductLoader", () => createModifierByProductLoader(db));
  }

  static modifierLoader(db: Db) {
    return memo(db, "modifierLoader", () => createModifierLoader(db));
  }

  static modifierItemLoader(db: Db) {
    return memo(db, "modifierItemLoader", () => createModifierItemLoader(db));
  }

  static modifierItemByIdLoader(db: Db) {
    return memo(db, "modifierItemByIdLoader", () => createModifierItemByIdLoader(db));
  }

  static orderStatusItemLoader(db: Db) {
    return memo(db, "orderStatusItemLoader", () => createOrderStatusItemLoader(db));
  }

  static orderModifierLoader(db: Db) {
    return memo(db, "orderModifierLoader", () => createOrderModifierLoader(db));
  }

  static discountByProductLoader(db: Db, warehouseId: string) {
    return memo(db, `discountByProductLoader:${keyOf(warehouseId)}`, () => createDiscountByProductLoader(db, warehouseId));
  }

  static appliedDiscountLoader(db: Db) {
    return memo(db, "appliedDiscountLoader", () => appliedProductDiscountLoader(db));
  }

  static orderPaymentLoader(db: Db) {
    return memo(db, "orderPaymentLoader", () => getOrderPaymentLoader(db));
  }

  static cinemaHallSeatLoader(db: Db) {
    return memo(db, "cinemaHallSeatLoader", () => createCinemaHallSeatLoader(db));
  }

  static movieByVariantIDLoader(db: Db) {
    return memo(db, "movieByVariantIDLoader", () => createMovieByVariantIDLoader(db));
  }

  static cinemaPricingTemplateLoader(db: Db) {
    return memo(db, "cinemaPricingTemplateLoader", () => createPricingTemplateLoader(db));
  }

  static customerLoader(db: Db) {
    return memo(db, "customerLoader", () => createCustomerLoader(db));
  }

  static cinemaHallLoader(db: Db) {
    return memo(db, "cinemaHallLoader", () => createCinemaHallLoader(db));
  }

  static cinemaReservationByShowTimeLoader(db: Db) {
    return memo(db, "cinemaReservationByShowTimeLoader", () => createCinemaReservationByShowtimeLoader(db));
  }

  static cinemaReservationByOrderDetailLoader(db: Db) {
    return memo(db, "cinemaReservationByOrderDetailLoader", () => createCinemaReservationByOrderDetailLoader(db));
  }

  static cinemaSeatLoader(db: Db) {
    return memo(db, "cinemaSeatLoader", () => createCinemaSeatLoader(db));
  }

  static showtimeLoader(db: Db) {
    return memo(db, "showtimeLoader", () => createShowtimeLoader(db));
  }

  static orderLoaderByCustomerId(db: Db) {
    return memo(db, "orderLoaderByCustomerId", () => createOrderLoaderByCustomerId(db));
  }

  static chartOfAccountsLoader(db: Db) {
    return memo(db, "chartOfAccountsLoader", () => createChartOfAccountsLoader(db));
  }

  static warehouseGroupByGroupIdLoader(db: Db) {
    return memo(db, "warehouseGroupByGroupIdLoader", () => createWarehouseGroupByGroupIdLoader(db));
  }

  static groupProductByGroupIdLoader(db: Db) {
    return memo(db, "groupProductByGroupIdLoader", () => createGroupProductByGroupIdLoader(db));
  }

  static kitchenLogByOrderDetailLoader(db: Db) {
    return memo(db, "kitchenLogByOrderDetailLoader", () => createKitchenLogByOrderDetailLoader(db));
  }

  static kitchenResendByOrderDetailLoader(db: Db) {
    return memo(db, "kitchenResendByOrderDetailLoader", () => createKitchenResendByOrderDetailLoader(db));
  }
}

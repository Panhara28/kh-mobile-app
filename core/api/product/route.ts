// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createProduct } from "../../lib/server-functions/product/create-product";
import { deleteProduct } from "../../lib/server-functions/product/delete-product";
import { updateProduct } from "../../lib/server-functions/product/update-product";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { Product, ProductInput } from "../../lib/types/product-type";

export const POST = withAuthApi<unknown, ProductInput, ResponseType<Product>>(
  async ({ db, body, logger, userAuth }) => {
    return await createProduct(db, body, logger, userAuth.admin!);
  }
);

export const PUT = withAuthApi<
  { id: string },
  ProductInput,
  ResponseType<Product>
>(async ({ db, body, logger }) => {
  return await updateProduct(db, body, logger);
});

export const DELETE = withAuthApi<
  unknown,
  { id: string },
  ResponseType<boolean>
>(async ({ db, body, logger }) => {
  return await deleteProduct(db, body, logger);
});

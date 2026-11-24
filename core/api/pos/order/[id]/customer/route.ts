// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { recalculateCustomerOrder } from "../../../../../classes/order";
import withAuthApi from "../../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../../lib/types";
import { NextResponse } from "../../../../../next-compat/server";

export const POST = withAuthApi<
  { id: string },
  { customer: number },
  ResponseType<unknown>
>(async ({ db, body, params }) => {
  await db.update("customer_order", { order_id: params?.id || "" }, {
      customer: body?.customer || 0,
    });

  return NextResponse.json({ success: true }, { status: 200 });
});

export const PUT = withAuthApi<
  { id: string },
  {
    customerId: string;
    code: string;
    type: "dine_in" | "take_away" | "food_delivery";
  },
  ResponseType<unknown>
>(async ({ db, body, params }) => {
  await db.tx(async (tx) => {
    const order = await tx.row("customer_order", { order_id: params?.id || "" });

    const prevCustomerId = order?.customer_id || null;

    const prevCustomer = await tx.row("customer", { id: prevCustomerId || 0 });
    const prevExtraPrice = prevCustomer?.extra_price || 0;
    const customer = await tx.row("customer", { id: body?.customerId || 0 });
    const newExtraPrice = customer?.extra_price || 0;

    if (!customer) return null;

    await tx.update("customer_order", { order_id: params?.id || "" }, {
        customer_id: body?.customerId || null,
        delivery_code: body?.code || null,
        served_type: body?.type || "dine_in",
      });

    if (Number(prevExtraPrice) !== Number(newExtraPrice)) {
      const orderDetails = await tx
        .table("customer_order_detail")
        .innerJoin(
          "product_variant",
          "customer_order_detail.variant_id",
          "product_variant.id",
        )
        .leftJoin(
          "product_categories",
          "product_categories.product_id",
          "product_variant.product_id",
        )
        .innerJoin(
          "product_category",
          "product_categories.category_id",
          "product_category.id",
        )
        .select("customer_order_detail.*")
        .select("product_category.mark_extra_fee")
        .select("product_variant.price as original_price")
        .where({
          order_id: params?.id || "",
          "product_category.exclude_fee_delivery": false,
        });

      for (const detail of orderDetails) {
        let updatedPrice = Number(detail.original_price);

        // If mark extra fee is set on category, use it for delivery customers
        if (
          Number(detail.mark_extra_fee) > 0 &&
          customer.customer_type === "delivery"
        ) {
          console.log("here", detail.mark_extra_fee);
          updatedPrice =
            Number(detail.original_price) + Number(detail.mark_extra_fee);
        }
        // Otherwise, adjust by difference in extra price
        else {
          updatedPrice = Number(detail.original_price) + Number(newExtraPrice);
        }

        await tx.update("customer_order_detail", { order_detail_id: detail.order_detail_id }, { price: updatedPrice });
        await recalculateCustomerOrder(
          { ...detail, qty: detail.qty, price: updatedPrice },
          tx,
        );
      }
    }
  });

  return NextResponse.json({ success: true }, { status: 200 });
});

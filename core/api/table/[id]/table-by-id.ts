// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Order } from "../../../classes/order";
import { getTableMode } from "../../../classes/table-mode";
import { LoaderFactory } from "../../../dataloader/loader-factory";
import { table_restaurant_tables } from "../../../generated/tables";
import {
  ForbiddenError,
  isCustomerRequest,
  requireCustomerTable,
} from "../../../lib/server-functions/customer-scope";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

interface table_with_order extends table_restaurant_tables {
  order: Order;
}

export const tableById = withAuthApi<
  { id: string },
  unknown,
  ResponseType<table_with_order>
>(
  async ({ db, userAuth, params }) => {
    // A diner can only see the table they scanned (and its open order).
    if (isCustomerRequest(userAuth) && params?.id !== requireCustomerTable(userAuth)) {
      throw new ForbiddenError("This is not your table");
    }

    const item = await db.row("restaurant_tables", { AND: [{ deleted_at: null }, { warehouse_id: userAuth.admin
          ? userAuth.admin?.currentWarehouseId || ""
          : userAuth.customer?.warehouseId }, { id: params?.id }] });

    // Table + Tag style: the groups at a table must not see each other's orders.
    const shared = isCustomerRequest(userAuth) && (await getTableMode(db, userAuth.customer?.warehouseId)).mode === "TAG";

    const order = shared
      ? undefined
      : await db.row("customer_order", { AND: [{ order_status: "DRAFT" }, { table_number: item?.id }] });

    const orderLoader = LoaderFactory.orderLoader(db);

    const row = {
      ...item,
      order: order ? await orderLoader.load(order.order_id) : null,
    };

    return NextResponse.json(
      {
        success: true,
        result: {
          ...row,
          order: row.order
            ? {
                ...row.order,
                orderId: row.order ? row.order.order_id! : null,
                invoiceNo: row.order ? row.order.invoice_no : null,
                customerId: row.order ? row.order.customer_id : null,
                orderStatus: row.order ? row.order.order_status : null,
                createdAt: row.order ? row.order.created_at : null,
                createdBy: row.order ? row.order.created_by : null,
                totalAmount: row.order ? row.order.total_amount : null,
                transferBy: row.order ? row.order.transfer_by : null,
                transferAt: row.order ? row.order.transfer_at : null,
              }
            : null,
        },
      },
      { status: 200 }
    );
  },
  ["CUSTOMER", "ADMIN"]
);

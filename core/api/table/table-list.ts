// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Order } from "../../classes/order";
import { LoaderFactory } from "../../dataloader/loader-factory";
import { table_restaurant_tables } from "../../generated/tables";
import { Formatter } from "../../lib/formatter";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

interface table_with_order extends table_restaurant_tables {
  order: Order | null;
  /** Every open order on the table; more than one only in the Table + Tag style. */
  orders: Order[];
}

export const listTable = withAuthApi<
  unknown,
  unknown,
  ResponseType<table_with_order[]>
>(async ({ db, userAuth }) => {
  const items = await db.rows("restaurant_tables", { AND: [{ deleted_at: null }, { warehouse_id: userAuth.admin!.currentWarehouseId }] }, { orderBy: [{ created_at: "asc" }] });

  const orders = await db.rows("customer_order", { AND: [{ table_number: { in: [...items.map((item) => item.id)] } }, { order_status: "DRAFT" }] }, { orderBy: [{ created_at: "asc" }] });

  const orderLoader = LoaderFactory.orderLoader(db);

  const ordersByTable = new Map<string, (typeof orders)[number][]>();
  for (const o of orders) {
    const list = ordersByTable.get(o.table_number);
    if (list) list.push(o);
    else ordersByTable.set(o.table_number, [o]);
  }

  const result = await Promise.all(
    items.map(async (x) => {
      const loaded = await Promise.all((ordersByTable.get(x.id) ?? []).map((o) => orderLoader.load(o.order_id)));
      const list = loaded.filter((o) => !!o).map((o) => toOrder(o as LoadedOrder));
      // `order` is the first one, for clients that know only one order per table
      return { ...x, order: list[0] ?? null, orders: list };
    }),
  );

  return NextResponse.json({ success: true, result }, { status: 200 });
});

type LoadedOrder = NonNullable<Awaited<ReturnType<ReturnType<typeof LoaderFactory.orderLoader>["load"]>>>;

function toOrder(o: LoadedOrder): Order {
  return {
    ...o,
    orderId: o.order_id!,
    invoiceNo: o.invoice_no,
    customerId: o.customer_id,
    orderStatus: o.order_status,
    createdAt: o.created_at ? Formatter.dateTime(o.created_at) : null,
    createdBy: o.created_by,
    totalAmount: o.total_amount,
    transferBy: o.transfer_by,
    transferAt: o.transfer_at,
    customer: o.customer,
    printCount: o.print_time || 0,
    servedType: o.served_type,
    deliveryCode: o.delivery_code,
    tagNo: o.tag_no,
  } as unknown as Order;
}

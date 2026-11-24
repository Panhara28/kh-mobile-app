// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpError } from "../lib/server-functions/customer-scope";
import { isUniqueError } from "../db/errors";
import { claimTag, getTableMode, refreshTableStatus } from "./table-mode";
import { Where } from "../db/sql";
import { CustomerOrderDiscount } from "../dataloader/discount-by-order-items-loader";
import { LoaderFactory } from "../dataloader/loader-factory";
import { OrderModifierType } from "../dataloader/order-modifier-loader";
import { OrderItemStatusType } from "../dataloader/order-status-item.loader";
import { ProductVariantType } from "../dataloader/product-variant-loader";
import {
  table_customer_order,
  table_customer_order_detail,
  table_discount_log,
  table_order_detail_modifier,
  table_order_item_status,
} from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { generateId, generateShortId } from "../lib/generate-id";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import { inList, type Db } from "../db/db";
import { z } from "zod";
import {
  applyDiscountToOrderItem,
  recalculateOrderLevelDiscount,
} from "./order-discount";
import { getOrderDiscountRules } from "../lib/order-discount-rules";
import { PromotionSetService } from "./promotion-set";
import { attachPromotionGroups } from "./order-promotion-groups";
import { applyModifierToOrderItem } from "./order-modifier";
import { OrderReturn } from "./order-return";
import { Payment, PaymentService } from "./payment";
import { Customer } from "./customer";
import { SeatReservation } from "./cinema/reservation";
import { Logger } from "../lib/logger";

export interface ReservationItem {
  showtimeId: string;
  seatId: string;
  price: number;
  code?: string;
}

interface CreateOrderOptionItem {
  id: string;
  variantId: string;
  qty: number;
  price: string;
  reservation?: ReservationItem[];
}

interface CreateOrderOption {
  items: CreateOrderOptionItem[];
  invoiceNo: number;
  customerId: string;
  warehouseId: string;
  createdBy: UserInfo;
  status?: table_customer_order["order_status"];
  tableNumber?: string;
  /** The group's tag (Table + Tag style; ignored in Normal style). */
  tagNo?: string;
  customer?: number;
  /** The id for the new order when the caller made it (a retried request then hits the same primary key instead of opening a second order). */
  orderId?: string;
}

export const orderFilterSchema = z.object({
  orderId: z.string().optional(),
  invoiceNo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  status: z
    .enum([
      "DRAFT",
      "APPROVED",
      "PROCESSING",
      "COMPLETED",
      "CANCELLED",
      "REFUND",
    ])
    .optional(),
  userId: z.string().optional(),
  shiftId: z.string().optional(),
  customerPhone: z.string().optional(),
  ticketCode: z.string().optional(),
  checkSharedDraft: z.string().optional(),
});

export type OrderFilter = z.infer<typeof orderFilterSchema>;

export interface KitchenLog {
  orderId: string;
  orderDetailId: string;
  itemPrice: string;
  printedAt: string | null;
}

/** One "Resend to Kitchen": who sent it again and how many portions. */
export interface KitchenResend {
  by: string;
  qty: number;
  resentAt: string;
}

export interface Order {
  orderId: string;
  invoiceNo: number;
  customerId: string;
  orderStatus: string;
  createdAt: string | null;
  paidAt?: string | null;
  createdBy: UserInfo | null;
  totalAmount: string;
  items?: OrderDetail[];
  transferAt?: string | null;
  transferBy?: UserInfo | null;
  tableNumber?: string;
  customer?: number;
  printCount?: number;
  tableName?: string;
  tagNo?: string | null;
  customerLoader?: Customer | null;
  servedType?: "dine_in" | "take_away" | "food_delivery" | "customer";
  deliveryCode?: string | null;
}

export interface OrderDetail {
  orderDetailId: string;
  variantId: string;
  title: string;
  sku: string;
  barcode: string;
  qty: number;
  price: string;
  discountAmount: string;
  modiferAmount: string;
  totalAmount: string;
  /** When the line was added (`YYYY-MM-DD HH:mm:ss`); drives happy-hour promotions. */
  createdAt?: string | null;
  orderReturns?: OrderReturn[];
  productVariant?: ProductVariantType;
  discounts?: CustomerOrderDiscount[];
  orderModifiers?: OrderModifierType[];
  status?: OrderItemStatusType[];
  reservation?: SeatReservation[];
  kitchenLogs?: KitchenLog[];
  kitchenResends?: KitchenResend[];
  /** Promotion sets this line belongs to (receipt grouping). */
  promotions?: OrderLinePromotion[];
}

/** One promotion set's use of an order line. */
export interface OrderLinePromotion {
  promotionId: string;
  title: string;
  /** Units of the line used by the set; null when it could not be resolved. */
  units: number | null;
  /** Units of the line that got money off. */
  discountedUnits: number | null;
  /** Money off this line from the set (as charged). */
  amount: number;
}

export class OrderService {
  constructor(
    protected tx: Db,
    protected user?: UserInfo,
  ) {}

  async checkOrderCompleted(orderId: string) {
    const order = await this.tx.row("customer_order", { AND: [{ order_id: orderId }, { order_status: "COMPLETED" }] });

    if (order) {
      return true;
    }
    return false;
  }

  async getOrderDetail(
    orderId: string,
    user: UserInfo,
  ): Promise<{
    orderInfo: Order;
    orderDetail: OrderDetail[];
    payments: Payment[];
  }> {
    const order = await this.tx.row("customer_order", { AND: [{ order_id: orderId }, { warehouse_id: user.currentWarehouseId }] });

    if (!order) {
      throw new Error("Order not found");
    }

    const userLoader = LoaderFactory.userLoader(this.tx);
    const customerLoader = LoaderFactory.customerLoader(this.tx);

    const table = await this.tx.row("restaurant_tables", { id: order.table_number });

    // customer order info
    const orderInfo: Order = {
      orderId: order.order_id!,
      invoiceNo: order.invoice_no,
      customerId: order.customer_id,
      orderStatus: order.order_status,
      createdAt: order.created_at ? Formatter.dateTime(order.created_at) : "",
      paidAt: order.paid_at ? Formatter.dateTime(order.paid_at) : null,
      createdBy: order.created_by
        ? await userLoader.load(order.created_by)
        : null,
      totalAmount: order.total_amount,
      tableNumber: order.table_number,
      printCount: order.print_time || 0,
      tableName: table ? table.table_name : undefined,
      tagNo: order.tag_no,
      servedType: order.served_type,
      deliveryCode: order.delivery_code,
      customerLoader: order.customer_id
        ? await customerLoader.load(order.customer_id)
        : null,
      customer: order.customer,
    };

    // customer order detail

    const orderDetailLoader = LoaderFactory.orderDetailLoader(
      this.tx,
      user.currentWarehouseId || "",
    );

    const orderDetail: OrderDetail[] = await attachPromotionGroups(
      this.tx,
      await orderDetailLoader.load(orderId),
    );
    // payment info
    const payments = await new PaymentService(this.tx).getPayment(orderId);

    return {
      orderInfo,
      orderDetail,
      payments,
    };
  }

  async getOrderList(
    filter: OrderFilter,
    user: UserInfo,
  ): Promise<{
    totalRows: number;
    orders: Order[];
  }> {
    const setting = await this.tx.row("setting", { AND: [{ option: "TYPE_POS" }, { warehouse: user.currentWarehouseId }] });
    const type_pos = JSON.parse(setting?.value || "{}") || "";
    const w = new Where().eq("customer_order.warehouse_id", user.currentWarehouseId);
    const joins: string[] = [];
    if (filter.orderId) w.eq("customer_order.order_id", filter.orderId);
    if (filter.invoiceNo) w.raw("customer_order.invoice_no LIKE ?", `%${filter.invoiceNo}`);
    if (filter.startDate) w.raw("COALESCE(customer_order.paid_at, customer_order.created_at) >= ?", filter.startDate);
    if (filter.endDate) w.raw("COALESCE(customer_order.paid_at, customer_order.created_at) < ?", filter.endDate);
    if (filter.status) w.eq("customer_order.order_status", filter.status);
    if (filter.checkSharedDraft === "1" && !type_pos.shared_order_draft) w.eq("customer_order.created_by", user.id);
    if (filter.shiftId) {
      joins.push("INNER JOIN order_payment ON customer_order.order_id = order_payment.order_id");
      w.eq("order_payment.shift_id", filter.shiftId);
    }
    if (filter.customerPhone) {
      joins.push("INNER JOIN customer ON customer.id = customer_order.customer_id");
      w.eq("customer.phone", filter.customerPhone);
    }
    if (filter.ticketCode) {
      joins.push(
        "INNER JOIN customer_order_detail ON customer_order_detail.order_id = customer_order.order_id",
        "INNER JOIN seat_reservation ON seat_reservation.order_detail_id = customer_order_detail.order_detail_id",
      );
      w.eq("seat_reservation.code", filter.ticketCode);
    }

    // Only the payment (shift) and ticket joins can return an order more than
    // once; without them skip DISTINCT so the database can read straight from the index.
    const hasDuplicatingJoin = !!filter.shiftId || !!filter.ticketCode;
    const from = `FROM customer_order ${joins.join(" ")} ${w}`;

    // Same shape as before ([{ total }]); the web and mobile clients read both this and a plain number.
    const [countRows, orders] = await Promise.all([
      this.tx.query<{ total: number }>(
        `SELECT ${hasDuplicatingJoin ? "COUNT(DISTINCT customer_order.order_id)" : "COUNT(customer_order.order_id)"} AS total ${from}`,
        w.args,
      ),
      this.tx.query(
        `SELECT ${hasDuplicatingJoin ? "DISTINCT " : ""}customer_order.* ${from}
         ORDER BY customer_order.created_at DESC LIMIT ? OFFSET ?`,
        [...w.args, filter.limit ?? 10, filter.offset ?? 0],
      ),
    ]);
    const totalRows = countRows as unknown as number;

    const userLoader = LoaderFactory.userLoader(this.tx);
    const orderDetailLoader = LoaderFactory.orderDetailLoader(
      this.tx,
      user.currentWarehouseId || "",
    );
    const customerLoader = LoaderFactory.customerLoader(this.tx);

    const result: Order[] = await Promise.all(
      orders.map(async (order) => {
        const items = await orderDetailLoader.load(order.order_id!);
        let createdBy: UserInfo | null = null;

        if (order.created_by) {
          if (order.served_type === "customer") {
            const customerCreated = await customerLoader.load(order.created_by);
            createdBy = {
              id: customerCreated?.id || "",
              username: "",
              fullname: customerCreated?.customerName || "",
              phoneNumber: customerCreated?.phone || "",
              token: "",
              profile: customerCreated?.photo || "",
              roleId: null,
              currentWarehouseId: customerCreated?.warehouse?.id || "",
              isDev: false,
              role: undefined,
              warehouse: customerCreated?.warehouse,
            };
          } else {
            createdBy = await userLoader.load(order.created_by);
          }
        }

        return {
          orderId: order.order_id!,
          invoiceNo: order.invoice_no,
          customerId: order.customer_id,
          orderStatus: order.order_status,
          createdAt: order.created_at
            ? Formatter.dateTime(order.created_at)
            : "",
          paidAt: order.paid_at ? Formatter.dateTime(order.paid_at) : null,
          createdBy,
          totalAmount: order.total_amount,
          transferBy: order.transfer_by
            ? await userLoader.load(order.transfer_by)
            : null,
          transferAt: order.transfer_at
            ? Formatter.dateTime(order.transfer_at)
            : "",
          items,
          tableNumber: order.table_number,
          tagNo: order.tag_no,
          printCount: order.print_time || 0,
          customerLoader: order.customer_id
            ? await customerLoader.load(order.customer_id)
            : null,
          servedType: order.served_type,
          deliveryCode: order.delivery_code,
        };
      }),
    );

    return {
      totalRows,
      orders: result,
    };
  }

  async create(option: CreateOrderOption) {
    return await this.tx.tx(async (tx) => {
      const now = Formatter.getNowDateTime();
      const orderId = option.orderId || generateId();

      let tagNo: string | null = null;
      const { mode, tagCount } = await getTableMode(tx, option.warehouseId);

      if (!!option.tableNumber && mode === "TAG") {
        // Several groups share a table. Every dine-in order carries its own tag.
        const table = await tx.row("restaurant_tables", { id: option.tableNumber, warehouse_id: option.warehouseId, deleted_at: null });
        if (!table) throw new HttpError(404, "Table not found");
        if (option.tagNo) tagNo = await claimTag(tx, option.warehouseId, tagCount, option.tagNo);
        else if (table.section !== "delivery") throw new HttpError(400, "Choose a tag for this group");
      } else if (!!option.tableNumber) {
        const checkHaveOrderOnTable = await tx.row("customer_order", { AND: [{ table_number: option.tableNumber }, { order_status: "DRAFT" }] });

        if (!!checkHaveOrderOnTable) {
          throw new Error("Table already have an active order");
        }
      }

      const setting = await tx.query<{ option: string; value: string }>(
        "SELECT * FROM setting WHERE option = ? AND (setting.warehouse = ? OR setting.warehouse IS NULL)",
        ["TYPE_POS", option.warehouseId],
      );

      const type_pos_setting = setting.find((s) => s.option === "TYPE_POS")
        ? JSON.parse(
            setting.find((s) => s.option === "TYPE_POS")?.value ||
              '{ "system_type": "", enviroment: "" }',
          )
        : { system_type: "", enviroment: "" };

      const isTesting = type_pos_setting.enviroment === "testing";

      const total = option.items.reduce((acc, item) => {
        const price = parseFloat(item.price);
        const amount = price * item.qty;
        return acc + amount;
      }, 0);

      const reservationItems: any[] = [];

      const items = option.items.map((item) => {
        const totalPrice = parseFloat(item.price) * item.qty;
        const order_detail_id = item.id || generateId();

        if (item.reservation && item.reservation.length > 0) {
          item.reservation.forEach((res) => {
            reservationItems.push({
              reservation_id: generateId(),
              order_detail_id: order_detail_id,
              showtime_id: res.showtimeId,
              seat_id: res.seatId,
              price: Number(res.price),
              created_at: now,
              created_by: option.createdBy.id,
              reservation_status: "pending",
              code: res.code ? res.code : generateShortId(7),
            });
          });
        }

        return {
          order_detail_id: order_detail_id,
          created_at: now,
          created_by: option.createdBy.id,
          variant_id: item.variantId,
          discount_amount: "0",
          order_id: orderId,
          price: item.price.toString(),
          total_amount: totalPrice.toString(),
          qty: item.qty,
          fulfilled_qty: 0,
          modifer_amount: "0",
        };
      });

      const order = {
        invoice_no: option.invoiceNo,
        order_id: orderId,
        customer_id: option.customerId,
        order_status: option.status ?? "DRAFT",
        warehouse_id: option.warehouseId,
        updated_at: now,
        created_at: now,
        created_by: option.createdBy.id,
        total_amount: total.toString(),
        table_number: option.tableNumber ?? "",
        tag_no: tagNo,
        customer: option.customer || 1,
        is_testing: isTesting ? 1 : 0,
      };

      if (items.length > 0) {
        await tx.insert(
          "customer_order_detail",
          items.map((x) => ({ ...x, is_testing: isTesting ? 1 : 0 })),
        );

        if (reservationItems.length > 0) {
          await tx.insert("seat_reservation", reservationItems);
        }
      }

      try {
        await tx.insert("customer_order", order);
      } catch (e) {
        // another till took the tag between the check and here (uq_open_tag)
        if (tagNo && isUniqueError(e, "tag_no")) throw new HttpError(409, `Tag ${tagNo} is already in use`);
        throw e;
      }

      if (!!option.tableNumber) {
        await tx.update("restaurant_tables", { id: option.tableNumber }, { status: "order_taken" });

        // for Restaurant POS, create order item status
        const orderStatus: table_order_item_status[] = items.map((item) => ({
          order_item_id: item.order_detail_id,
          status: "pending",
          qty: item.qty,
          created_by: option.createdBy.id,
          created_at: Formatter.getNowDateTime(),
        }));

        if (orderStatus.length > 0) {
          await tx.insert("order_item_status", orderStatus);
        }
      }

      const variantDiscountApplied = await applyVariantDiscountLogs(
        items.map((i) => i.order_detail_id),
        tx,
        option.createdBy.id,
      );

      // applyVariantDiscountLogs already ran the order-wide pass when it
      // touched a line; otherwise evaluate promotion sets here.
      const promotionApplied =
        variantDiscountApplied > 0 ||
        (items.length > 0 &&
          (await refreshOrderPromotions(orderId, tx, option.createdBy.id)));

      return {
        order,
        items,
        variantDiscountApplied: variantDiscountApplied > 0,
        promotionApplied,
      };
    });
  }

  async delete(id: string, logger?: Logger) {
    return await this.tx.tx(async (tx) => {
      const order = await tx.row("customer_order", { AND: [{ order_id: id }, { order_status: "DRAFT" }] });

      if (!order) {
        throw new Error("Id not found");
      }

      if (logger) {
        logger.serverLog("customer_order:DELETE", {
          action: "delete",
          table_name: "customer_order",
          key: order.order_id,
          content: order,
        });
      }

      // delete discount log
      // discount logs, modifiers and item statuses of the order's lines, in one round trip
      const lines = "SELECT customer_order_detail.order_detail_id FROM customer_order_detail WHERE order_id = ?";
      await tx.batch([
        { sql: `DELETE FROM discount_log WHERE order_detail_id IN (${lines})`, args: [id] },
        { sql: `DELETE FROM order_detail_modifier WHERE order_detail_id IN (${lines})`, args: [id] },
        { sql: `DELETE FROM order_item_status WHERE order_item_id IN (${lines})`, args: [id] },
      ]);

      // delete order
      await tx.del("customer_order", { order_id: id });

      if (order.tag_no && order.table_number) await refreshTableStatus(tx, order.table_number, "available");

      // delete order detail
      const items = await tx.rows("customer_order_detail", { order_id: id }, { select: ["order_detail_id"] });
      await tx.del("customer_order_detail", { order_id: id });

      // delete seat reservation if exists
      if (items.length > 0) {
        const seat_reservations = await tx.rows("seat_reservation", { order_detail_id: { in: [...items.map((i) => i.order_detail_id)] } });

        await tx.del("seat_reservation", { order_detail_id: { in: [...items.map((i) => i.order_detail_id)] } });

        logger?.serverLog("customer_order_detail:DELETE", {
          action: "delete",
          table_name: "customer_order_detail",
          key: items.map((i) => i.order_detail_id).join(","),
          content: { items },
        });

        if (seat_reservations.length > 0) {
          logger?.serverLog("seat_reservation:DELETE", {
            action: "delete",
            table_name: "seat_reservation",
            key: seat_reservations.map((i) => i.reservation_id).join(","),
            content: { seat_reservations },
          });
        }
      }

      return true;
    });
  }

  async updateOrderItem(
    id: string,
    itemId: string,
    qty: number,
    reservation?: ReservationItem[],
  ) {
    return await this.tx.tx(async (trx) => {
      // get existing order item
      const orderItem: table_customer_order_detail = await trx.row<table_customer_order_detail>("customer_order_detail", { AND: [{ order_id: id }, { order_detail_id: itemId }] });

      if (!orderItem) {
        throw new Error("Order item not found");
      }

      let price = orderItem.price || "0";

      if (reservation && reservation.length > 0) {
        await trx.del("seat_reservation", { order_detail_id: itemId });

        price = reservation.reduce((a, b) => a + b.price, 0).toString();

        await updateOrderDetail(
          itemId,
          {
            qty: qty,
            price: price,
          },
          trx,
        );
        orderItem.price = price;

        await trx.insert(
          "seat_reservation",
          reservation.map((x) => {
            return {
              reservation_id: generateId(),
              order_detail_id: itemId,
              showtime_id: x.showtimeId,
              price: x.price,
              seat_id: x.seatId,
              reservation_status: "pending",
              created_at: Formatter.getNowDateTime(),
              created_by: this.user?.id,
              code: x.code ? x.code : generateShortId(7),
            };
          }),
        );
      } else {
        await updateOrderDetail(
          itemId,
          {
            qty: qty,
          },
          trx,
        );
      }

      orderItem.qty = qty;

      // recalculate total discount and amount
      await recalculateCustomerOrder(orderItem, trx);
    });
  }

  async deleteOrderItem(id: string, itemId: string) {
    return await this.tx.tx(async (trx) => {
      await trx.del("customer_order_detail", { AND: [{ order_id: id }, { order_detail_id: itemId }] });

      //delete all discount log
      await trx.del("discount_log", { order_detail_id: itemId });

      // delete all modifier
      await trx.del("order_detail_modifier", { order_detail_id: itemId });

      // delete all order item status
      await trx.del("order_item_status", { order_item_id: itemId });

      // delete seat reservation if exists
      await trx.del("seat_reservation", { order_detail_id: itemId });

      // recalculate total amount of order
      await updateOrderTotalAmount(id, trx);

      // Removing a line can break (or rebalance) a promotion set.
      await refreshOrderPromotions(id, trx, this.user?.id ?? null);
    });
  }

  async addOrderItem(
    id: string,
    data: CreateOrderOptionItem,
    user: UserInfo,
    type: "TRANSFER" | "NORMAL" = "NORMAL",
  ) {
    return await this.tx.tx(async (trx) => {
      const now = Formatter.getNowDateTime();
      const totalPrice = parseFloat(data.price) * data.qty;

      const setting = await trx.row("setting", { AND: [{ option: "TYPE_POS" }, { warehouse: user.currentWarehouseId }] });

      const type_pos_setting = setting
        ? JSON.parse(setting.value || '{ "system_type": "", enviroment: "" }')
        : { system_type: "", enviroment: "" };

      const item: table_customer_order_detail = {
        order_detail_id: data.id,
        created_at: now,
        created_by: user.id,
        variant_id: data.variantId,
        discount_amount: "0",
        order_id: id,
        price: String(data.price),
        total_amount: totalPrice.toString(),
        qty: data.qty,
        fulfilled_qty: 0,
        modifer_amount: "0",
        is_testing: type_pos_setting.enviroment === "testing" ? 1 : 0,
      };

      await trx.insert("customer_order_detail", item);

      if (data.reservation && data.reservation.length > 0) {
        const reservationItems = data.reservation.map((r) => {
          return {
            reservation_id: generateId(),
            order_detail_id: data.id,
            showtime_id: r.showtimeId,
            seat_id: r.seatId,
            reservation_status: "pending",
            created_at: now,
            created_by: user.id,
            price: r.price.toString(),
            code: r.code ? r.code : generateShortId(7),
          };
        });

        await trx.insert("seat_reservation", reservationItems);
      }

      if (type === "NORMAL") {
        // for Restaurant POS, create order item status
        const orderStatus: table_order_item_status = {
          order_item_id: item.order_detail_id || "",
          status: "pending",
          qty: Number(item.qty),
          created_by: item.created_by || "",
          created_at: Formatter.getNowDateTime(),
        };

        await trx.insert("order_item_status", orderStatus);
      }

      await updateOrderTotalAmount(id, trx);

      const variantDiscountApplied = await applyVariantDiscountLogs(
        [data.id],
        trx,
        user.id,
      );

      // The new line may complete a promotion set (e.g. the 8th beer).
      const promotionApplied =
        variantDiscountApplied > 0 ||
        (await refreshOrderPromotions(id, trx, user.id));

      return {
        ...item,
        variantDiscountApplied: variantDiscountApplied > 0,
        promotionApplied,
      };
    });
  }

  async checkout(orderId: string, user: UserInfo) {
    const now = Formatter.getNowDateTime();
    return await this.tx.tx(async (trx) => {
      const order: table_customer_order = await trx.row<table_customer_order>("customer_order", { AND: [{ order_id: orderId }, { order_status: { notIn: [...["COMPLETED", "CANCELLED", "REFUND"]] } }] });

      if (!order) {
        throw new Error("Order not found or already checked out");
      }

      await trx.update("customer_order", { order_id: orderId }, {
        order_status: "COMPLETED",
        updated_at: now,
        paid_at: now,
      });

      // Other groups may still sit there (Table + Tag style)
      if (order.table_number) await refreshTableStatus(trx, order.table_number, "cleaning");

      const orderItems: table_customer_order_detail[] = await trx.rows<table_customer_order_detail>("customer_order_detail", { order_id: orderId });

      if (orderItems.length === 0) {
        throw new Error("No items found for this order");
      }

      const items = orderItems.map((item) => {
        return {
          order_detail_id: item.order_detail_id,
          created_at: now,
          created_by: user.id,
          variant_id: item.variant_id,
          discount_amount: item.discount_amount,
          order_id: item.order_id,
          price: item.price,
          total_amount: item.total_amount,
          qty: item.qty || 0,
          fulfilled_qty: 0,
          modifer_amount: "0",
        };
      });

      return { order, items };
    });
  }

  async orderPrintTime(orderId: string) {
    return await this.tx.tx(async (trx) => {
      const order = await trx.row("customer_order", { order_id: orderId });

      if (order.order_status === "COMPLETED") {
        await trx.p.customer_order.updateMany({ where: { order_id: orderId }, data: { print_time: { increment: 1 } } });
      }
      if (order.order_status === "DRAFT") {
        await trx.update("customer_order", { order_id: orderId }, { print_time: 1 });
      }
      return true;
    });
  }
}

export async function recalculateCustomerOrder(
  orderItem: table_customer_order_detail,
  knex: Db,
  _retries = 3,
): Promise<{
  totalDiscount: number;
  orderItemAmount: number;
  discountLog: CustomerOrderDiscount[];
}> {
  // Reset initial order item values on each attempt (fields are mutated in-place below)
  orderItem.total_amount = (
    Number(orderItem.price || 0) * Number(orderItem.qty || 0)
  ).toString();

  orderItem.discount_amount = "0";
  orderItem.modifer_amount = "0";

  try {
    return await knex.tx(async (trx) => {
      // Order-level discount rules are per-warehouse; the line row has no
      // warehouse, so resolve it from the parent order.
      const orderRow = await trx.row<table_customer_order>("customer_order", { order_id: orderItem.order_id });
      const rules = await getOrderDiscountRules(
        trx,
        orderRow?.warehouse_id ?? null,
      );

      await applyModifierToOrderItem(orderItem, trx);

      await applyDiscountToOrderItem(orderItem, trx, rules);

      await updateOrderDetail(
        orderItem.order_detail_id!,
        {
          total_amount: orderItem.total_amount,
          discount_amount: orderItem.discount_amount,
          modifer_amount: orderItem.modifer_amount,
        },
        trx,
      );

      // recalculate total amount of order
      await updateOrderTotalAmount(orderItem.order_id!, trx);

      // Re-evaluate the whole-order threshold discount now that every line is
      // settled, then re-sum. Idempotent — safe to run once per line in a batch.
      await recalculateOrderLevelDiscount(
        orderItem.order_id!,
        trx,
        rules,
        orderItem.created_by ?? null,
        orderRow?.warehouse_id ?? null,
      );

      // The order-level pass may have written an "order" discount slice onto
      // this line — reflect it in the mutated orderItem / return value.
      const refreshed = await getOrderDetail(orderItem.order_detail_id!, trx);
      if (refreshed) {
        orderItem.discount_amount =
          refreshed.discount_amount ?? orderItem.discount_amount;
        orderItem.total_amount =
          refreshed.total_amount ?? orderItem.total_amount;
      }

      return {
        totalDiscount: Number(orderItem.discount_amount),
        orderItemAmount: Number(orderItem.total_amount),
        discountLog: [],
      };
    });
  } catch (err: any) {
    // MySQL deadlock error (errno 1213 / sqlState '40001') — retry with jitter
    if (_retries > 0 && (err?.errno === 1213 || err?.sqlState === "40001")) {
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100),
      );
      return recalculateCustomerOrder(orderItem, knex, _retries - 1);
    }
    throw err;
  }
}

/**
 * Re-run the order-wide discount pass (promotion sets + order-level threshold
 * rules) after lines were added or removed. Skipped when the branch has no
 * active promotion set, to keep add-item cheap; per-line edits already go
 * through recalculateCustomerOrder, which always runs the pass.
 *
 * Returns true when the pass ran (the client should refetch the order).
 */
export async function refreshOrderPromotions(
  orderId: string,
  trx: Db,
  createdBy: string | null,
): Promise<boolean> {
  const orderRow = await trx.row<table_customer_order>("customer_order", { order_id: orderId });
  if (!orderRow) return false;
  const warehouseId = orderRow.warehouse_id ?? null;

  const promotions = await new PromotionSetService(trx).getActive(warehouseId);
  if (promotions.length === 0) return false;

  const rules = await getOrderDiscountRules(trx, warehouseId);
  await recalculateOrderLevelDiscount(
    orderId,
    trx,
    rules,
    createdBy,
    warehouseId,
  );
  return true;
}

export async function updateOrderTotalAmount(orderId: string, trx: Db) {
  // Two-step: compute the sum first, then update — avoids self-referential
  // subquery lock contention that leads to deadlocks under concurrent writes.
  const rows = await trx.query<{ total: string }>(
    `SELECT SUM(COALESCE(total_amount, 0)) AS total FROM customer_order_detail WHERE order_id = ?`,
    [orderId],
    { total: { kind: "decimal", scale: 2 } },
  );
  const total = rows[0]?.total ?? "0";

  await trx.update("customer_order", { order_id: orderId }, { total_amount: total });
}

export async function updateOrderDetail(
  orderDetailId: string,
  data: Partial<table_customer_order_detail>,
  knex: Db,
) {
  await knex.update("customer_order_detail", { order_detail_id: orderDetailId }, data);
}

export async function getOrderDetail(
  orderDetailId: string,
  trx: Db,
): Promise<table_customer_order_detail | undefined> {
  return await trx.row<table_customer_order_detail>("customer_order_detail", { order_detail_id: orderDetailId });
}

/**
 * Auto-apply the product-variant "menu discount" to the given order lines by
 * writing a `discount_log` sentinel row (`discount_id = "variant"`), then
 * recalculating each line. Idempotent: a line that already has a variant
 * discount row is skipped. Called from both order creation and add-item so POS
 * and the public menu behave identically.
 */
export async function applyVariantDiscountLogs(
  orderDetailIds: string[],
  trx: Db,
  createdBy: string,
): Promise<number> {
  if (orderDetailIds.length === 0) return 0;
  const now = Formatter.getNowDateTime();

  const rows = await trx.query(
    `SELECT customer_order_detail.order_detail_id AS order_detail_id, product_variant.discount_type AS discount_type,
            product_variant.discount_value AS discount_value
     FROM customer_order_detail JOIN product_variant ON customer_order_detail.variant_id = product_variant.id
     WHERE customer_order_detail.order_detail_id IN (${inList(orderDetailIds)})`,
    [...orderDetailIds],
  );

  const existing: table_discount_log[] = await trx.rows<table_discount_log>("discount_log", { AND: [{ order_detail_id: { in: [...orderDetailIds] } }, { discount_id: "variant" }] });
  const alreadyHas = new Set(existing.map((e) => e.order_detail_id));

  const toInsert = rows
    .filter(
      (r: any) =>
        r.discount_type &&
        Number(r.discount_value) > 0 &&
        !alreadyHas.has(r.order_detail_id),
    )
    .map((r: any) => ({
      id: generateId(),
      order_detail_id: r.order_detail_id as string,
      discount_id: "variant",
      discount_title: "Variant Discount",
      discount_type: r.discount_type as "AMOUNT" | "PERCENTAGE",
      value: String(r.discount_value),
      is_manual_discount: 0,
      created_at: now,
      created_by: createdBy,
    }));

  if (toInsert.length === 0) return 0;

  await trx.insert("discount_log", toInsert);

  for (const row of toInsert) {
    const orderItem = await getOrderDetail(row.order_detail_id, trx);
    if (orderItem) {
      await recalculateCustomerOrder(orderItem, trx);
    }
  }

  return toInsert.length;
}

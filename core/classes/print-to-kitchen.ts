// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { LoaderFactory } from "../dataloader/loader-factory";
import {
  table_customer_order,
  table_order_detail_modifier,
  table_product,
  table_product_categories,
  table_product_category,
  table_product_variant,
  table_restaurant_tables,
  table_setting,
  table_warehouse_variant_printer,
} from "../generated/tables";
import { Formatter } from "../lib/formatter";
import { UserInfo } from "../lib/server-functions/get-auth-from-token";
import type { Db } from "../db/db";
import { getOrderDetail } from "./order";
import moment from "moment-timezone";


interface Printers {
  printers: PrinterInfo[];
  print_server_ip: string;
}

interface PrinterInfo {
  name: string;
  printer_name: string;
  ip: string;
  port: number;
  id: string;
}

export class PrintToKitchenService {
  constructor(
    protected tx: Db,
    protected user: UserInfo,
  ) {}

  async printTestContent(receiptCount: number) {
    const setting = await this.tx.row("setting", { AND: [{ option: "PRINT_SERVER" }, { warehouse: this.user.currentWarehouseId }] });

    if (setting) {
      const data = [];
      const printerSettings = JSON.parse(setting.value);

      for (let i = 0; i < receiptCount; i++) {
        const contentToPrint: Record<string, unknown>[] = [
          {
            type: "image",
            url: "https://s9.kh1.co/12d44b8ec749071f404ae797cffcaa30.webp",
            width: "160px", // width of image in px; default: auto
            height: "80px",
            style: {
              margin: "10 0px 0 0px",
            },
          },
          {
            type: "text",
            value: `តុលេខ: ${String(i + 1).padStart(2, "0")}`,
            style: {
              fontSize: "20px",
              fontWeight: "bold",
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
            },
          },
          {
            type: "text",
            value: `កាលបរិច្ឆេទ: ${Formatter.getNowDateTime()}`,
            style: {
              fontSize: "18px",
              fontWeight: "bold",
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
            },
          },
          {
            type: "text",
            value: `បញ្ជាទិញដោយ: ${this.user.fullname}`,
            style: {
              fontSize: "18px",
              fontWeight: "bold",
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
            },
          },
          {
            type: "text",
            value: `ចំនួន: x${Math.floor(Math.random() * 5) + 1}`,
            style: {
              fontSize: "18px",
              fontWeight: "bold",
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
            },
          },
          {
            type: "text",
            value: "--------------------------------",
            style: {
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
            },
          },
          {
            type: "text",
            value: `ទំនិញ:   Sample item`,
            style: {
              fontSize: "18px",
              fontWeight: "bold",
              fontFamily: `'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`,
              whiteSpace: "pre-wrap",
              width: "257px",
              display: "block",
              wordBreak: "break-word",
            },
          },
        ];

        const legnth = printerSettings.printers.length;

        data.push({
          created_at: Formatter.getNowDateTime(),
          created_by: this.user.id,
          content: JSON.stringify(contentToPrint),
          printer_info: JSON.stringify(
            printerSettings.printers[Math.floor(Math.random() * legnth)],
          ),
          warehouse_id: this.user.currentWarehouseId,
          order_id: null,
          order_detail_id: null,
          item_price: 1,
        });
      }

      await this.tx.insert("print_queue", data);
      return true;
    }
  }

  async printOrderToKitchen(orderItemId: string, qty: number, reprint = false) {
    const orderItem = await getOrderDetail(orderItemId, this.tx);
    if (!orderItem?.variant_id)
      throw new Error("Order item variant ID not found");

    const order: table_customer_order = await this.tx.row("customer_order", { order_id: orderItem?.order_id });
    const printer = await getPrinterInfo(
      orderItem?.variant_id,
      this.tx,
      this.user,
    );
    if (!printer) return;

    const variantLoader = LoaderFactory.productVariantByIdLoader(
      this.tx,
      this.user.currentWarehouseId!,
    );

    const productVariant = await variantLoader.load(
      orderItem?.variant_id || "",
    );

    const modifiers = await getOrderDetailModifiers(orderItemId, this.tx);
    const table = await getTableDetails(orderItem.order_id!, this.tx);
    const orderByUser = await this.tx.row("user", { id: orderItem.created_by });
    const contentToPrint: Record<string, unknown>[] = [
      {
        type: "image",
        url: "https://s9.kh1.co/12d44b8ec749071f404ae797cffcaa30.webp",
        width: "160px", // width of image in px; default: auto
        height: "80px",
        style: {
          margin: "10 0px 0 0px",
        },
      },
      {
        type: "text",
        value: `${TABLE_LABEL}${table?.table_name}`,
        style: {
          fontSize: "25px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      },
      {
        type: "text",
        value: `កាលបរិច្ឆេទ: ${moment().tz("Asia/Phnom_Penh").format("YYYY-MM-DD hh:mm:ss A")}`,
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      },
      {
        type: "text",
        value: `បញ្ជាទិញដោយ: ${orderByUser?.fullname}`,
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      },
      ticketText(`លេខកុម្ម៉ង់: ${order.invoice_no ?? ""}`),
    ];
    if (order.tag_no) contentToPrint.splice(2, 0, ticketText(`${TAG_LABEL}${order.tag_no}`, "25px"));
    if (orderItem.created_at) {
      contentToPrint.push(
        ticketText(`ម៉ោងកុម្ម៉ង់: ${moment(orderItem.created_at).tz("Asia/Phnom_Penh").format("hh:mm A")}`),
      );
    }

    if (
      table.section === "delivery" ||
      order.served_type === "take_away" ||
      order.served_type === "food_delivery"
    ) {
      contentToPrint.push({
        type: "text",
        value: "ប្រភេទ: វេចខ្ចប់",
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      });
    }

    contentToPrint.push(
      {
        type: "text",
        value: `ចំនួន: x${qty}`,
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      },
      {
        type: "text",
        value: "--------------------------------",
        style: {
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      },
      {
        type: "text",
        value: `ទំនិញ:   ${itemTitle(productVariant)}`,
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
          whiteSpace: "pre-wrap",
          width: "257px",
          display: "block",
          wordBreak: "break-word",
        },
      },
    );

    if (modifiers.length > 0) {
      for (const m of modifiers) {
        contentToPrint.push({
          type: "text",
          value: `   + ${m.modifier}`,
          style: {
            fontSize: "23px",
            fontWeight: "bold",
            fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
          },
        });
      }
    }

    const existingQueue = await this.tx.rows("print_kitchen_log", { order_detail_id: orderItemId });

    if (existingQueue.length > 0 && !!reprint) {
      contentToPrint.push({
        type: "text",
        value: `***** Resend to Kitchen By ${this.user.fullname} (${existingQueue.length}) *****`,
        style: {
          fontSize: "23px",
          fontWeight: "bold",
          fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
        },
      });
    }

    if (reprint) {
      // Kept apart from the ticket text: the ticket only says "Resend" once a printed ticket
      // exists, and the app shows who resent what from this log.
      await this.tx.insert("print_resend_log", {
        order_id: orderItem.order_id,
        order_detail_id: orderItemId,
        qty,
        resent_by_id: this.user.id,
        resent_by_name: this.user.fullname,
        created_at: Formatter.getNowDateTime(),
      });
    }

    const result = await this.tx.insert("print_queue", {
      created_at: Formatter.getNowDateTime(),
      created_by: this.user.id,
      content: JSON.stringify(contentToPrint),
      printer_info: JSON.stringify(printer),
      warehouse_id: this.user.currentWarehouseId,
      order_id: orderItem.order_id,
      order_detail_id: orderItemId,
      item_price: orderItem.price?.toString() || "0",
    });

    // Printed by the server's kitchen print worker (src/lib/printing/kitchen-queue.ts).
    const queueId = Array.isArray(result) ? result[0] : result;
    return { queueId };
  }

  /**
   * Tells the kitchen that an order moved: one ticket per printer that has items still cooking, listing only those.
   * Its order's tickets that haven't printed yet get the new table. Returns the number of tickets queued.
   */
  async printTableChange(order: table_customer_order, fromTable: string, toTable: string): Promise<number> {
    const waiting: { id: number; content: unknown }[] = await this.tx.rows("print_queue", { order_id: order.order_id, kind: "NEW_ORDER" });
    for (const row of waiting) {
      const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
      if (!Array.isArray(content)) continue;
      for (const step of content) {
        if (typeof step?.value === "string" && step.value.startsWith(TABLE_LABEL)) step.value = TABLE_LABEL + toTable;
      }
      await this.tx.update("print_queue", { id: row.id }, { content: JSON.stringify(content) });
    }

    const cooking = await this.tx.query<{ order_detail_id: string; variant_id: string; qty: number }>(
      `SELECT d.order_detail_id, d.variant_id, s.qty FROM customer_order_detail d
       INNER JOIN order_item_status s ON s.order_item_id = d.order_detail_id
       WHERE d.order_id = ? AND s.status = 'cooking' AND s.qty > 0 ORDER BY d.created_at`,
      [order.order_id],
    );
    const loader = LoaderFactory.productVariantByIdLoader(this.tx, this.user.currentWarehouseId!);
    const byPrinter = new Map<string, { printer: object; lines: string[] }>();
    for (const item of cooking) {
      const printer = await getPrinterInfo(item.variant_id, this.tx, this.user);
      if (!printer) continue;
      if (!byPrinter.has(printer.id)) byPrinter.set(printer.id, { printer, lines: [] });
      const { lines } = byPrinter.get(printer.id)!;
      lines.push(`x${Number(item.qty)}  ${itemTitle(await loader.load(item.variant_id))}`);
      for (const m of await getOrderDetailModifiers(item.order_detail_id, this.tx)) lines.push(`   + ${m.modifier}`);
    }

    for (const { printer, lines } of byPrinter.values()) {
      const content = [
        ticketText("*** ប្តូរតុ / TABLE CHANGED ***", "28px"),
        ticketText("មិនមែនកុម្ម៉ង់ថ្មី / NOT A NEW ORDER"),
        ticketText(`តុចាស់ (From): ${fromTable}`, "25px"),
        ticketText(`តុថ្មី (To): ${toTable}`, "30px"),
        ...(order.tag_no ? [ticketText(`${TAG_LABEL}${order.tag_no}`, "25px")] : []),
        ticketText(`លេខកុម្ម៉ង់: ${order.invoice_no ?? ""}`),
        ticketText(`កាលបរិច្ឆេទ: ${moment().tz("Asia/Phnom_Penh").format("YYYY-MM-DD hh:mm:ss A")}`),
        ticketText(`ប្តូរដោយ: ${this.user.fullname}`),
        ticketText("--------------------------------"),
        ...lines.map((l) => ticketText(l)),
      ];
      await this.tx.insert("print_queue", {
        created_at: Formatter.getNowDateTime(),
        created_by: this.user.id,
        content: JSON.stringify(content),
        printer_info: JSON.stringify(printer),
        warehouse_id: this.user.currentWarehouseId,
        order_id: order.order_id,
        order_detail_id: null,
        item_price: "0",
        kind: "TABLE_CHANGE",
      });
    }
    return byPrinter.size;
  }

  /**
   * Tells the kitchen to stop cooking a removed line: one "CANCELLED" ticket on its printer for the quantity still
   * cooking. Call before the line is deleted. Returns true when a ticket was queued.
   */
  async printItemCancel(orderItemId: string): Promise<boolean> {
    const item = await this.tx.query<{ order_id: string; variant_id: string; qty: number }>(
      `SELECT d.order_id, d.variant_id, s.qty FROM customer_order_detail d
       INNER JOIN order_item_status s ON s.order_item_id = d.order_detail_id
       WHERE d.order_detail_id = ? AND s.status = 'cooking' AND s.qty > 0 LIMIT 1`,
      [orderItemId],
    );
    if (!item[0]) return false;
    const { order_id, variant_id, qty } = item[0];
    const printer = await getPrinterInfo(variant_id, this.tx, this.user);
    if (!printer) return false;
    const order: table_customer_order | undefined = await this.tx.row("customer_order", { order_id });
    const table = await getTableDetails(order_id, this.tx);
    const variant = await LoaderFactory.productVariantByIdLoader(this.tx, this.user.currentWarehouseId!).load(variant_id);
    const content = [
      ticketText("*** បោះបង់ / CANCELLED ***", "28px"),
      ticketText("កុំធ្វើ / DO NOT MAKE"),
      ticketText(`${TABLE_LABEL}${table?.table_name ?? ""}`, "30px"),
      ...(order?.tag_no ? [ticketText(`${TAG_LABEL}${order.tag_no}`, "25px")] : []),
      ticketText(`លេខកុម្ម៉ង់: ${order?.invoice_no ?? ""}`),
      ticketText(`កាលបរិច្ឆេទ: ${moment().tz("Asia/Phnom_Penh").format("YYYY-MM-DD hh:mm:ss A")}`),
      ticketText(`បោះបង់ដោយ: ${this.user.fullname}`),
      ticketText("--------------------------------"),
      ticketText(`x${Number(qty)}  ${itemTitle(variant)}`),
      ...(await getOrderDetailModifiers(orderItemId, this.tx)).map((m) => ticketText(`   + ${m.modifier}`)),
    ];
    await this.tx.insert("print_queue", {
      created_at: Formatter.getNowDateTime(),
      created_by: this.user.id,
      content: JSON.stringify(content),
      printer_info: JSON.stringify(printer),
      warehouse_id: this.user.currentWarehouseId,
      order_id,
      order_detail_id: orderItemId,
      item_price: "0",
      kind: "ITEM_CANCEL",
    });
    return true;
  }
}

const TABLE_LABEL = "តុលេខ: ";
const TAG_LABEL = "ស្លាកលេខ (Tag): ";

function ticketText(value: string, fontSize = "23px") {
  return {
    type: "text",
    value,
    style: {
      fontSize,
      fontWeight: "bold",
      fontFamily: `'Kantumruy Pro', 'Hanuman', 'Courier New', Courier, monospace`,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
  };
}

function itemTitle(v?: { name?: string | null; basicProduct?: { title?: string | null } | null } | null) {
  return `${v?.basicProduct?.title} (${v?.name})`;
}

async function getOrderDetailModifiers(orderItemId: string, tx: Db) {
  return await tx
    .table<table_order_detail_modifier>("order_detail_modifier")
    .leftJoin(
      "modifier_items",
      "order_detail_modifier.modifier_item_id",
      "modifier_items.id",
    )
    .where("order_detail_modifier.order_detail_id", orderItemId)
    .orderByRaw("order_detail_modifier.modifier_item_id IS NULL ASC")
    .select(
      tx.raw(`
        COALESCE(modifier_items.name, order_detail_modifier.notes) AS modifier,
        order_detail_modifier.price
    `),
    );
}

async function getTableDetails(orderId: string, tx: Db) {
  return await tx
    .table<table_restaurant_tables>("restaurant_tables")
    .innerJoin<table_customer_order>(
      "customer_order",
      "customer_order.table_number",
      "restaurant_tables.id",
    )
    .where("customer_order.order_id", orderId)
    .select("restaurant_tables.*")
    .first<table_restaurant_tables>();
}

// The variant's own printer wins; otherwise the category's default printer.
async function getPrinterInfo(
  productVariantId: string,
  tx: Db,
  user: UserInfo,
) {
  const variantPrinter: table_warehouse_variant_printer | undefined = await tx.row<table_warehouse_variant_printer>("warehouse_variant_printer", { AND: [{ warehouse_id: user.currentWarehouseId! }, { variant_id: productVariantId }] });

  if (variantPrinter) {
    const printer = await getPrinterById(variantPrinter.printer_id, tx, user);
    if (printer) return printer;
  }

  const query = tx
    .table<table_product>("product")
    .innerJoin<table_product_variant>(
      "product_variant",
      "product.id",
      "product_variant.product_id",
    )
    .innerJoin<table_product_categories>(
      "product_categories",
      "product.id",
      "product_categories.product_id",
    )
    .innerJoin<table_product_category>(
      "product_category",
      "product_categories.category_id",
      "product_category.id",
    )
    .innerJoin(
      "warehouse_category_printer",
      "warehouse_category_printer.category_id",
      "product_category.id",
    )
    .where({
      "product_variant.id": productVariantId,
      "warehouse_category_printer.warehouse_id": user.currentWarehouseId,
    })
    .select(
      "product_category.*",
      "warehouse_category_printer.printer_id as printer",
    );

  const rows: (table_product_category & { printer: string })[] = await query;

  for (const row of rows) {
    if (row.printer) {
      const printer = await getPrinterById(row.printer, tx, user);
      if (printer) return printer;
    }
  }
  return null;
}

async function getPrinterById(printerId: string, tx: Db, user?: UserInfo) {
  const printerSettings = await tx.row<table_setting>("setting", { AND: [{ option: "PRINT_SERVER" }, { warehouse: user?.currentWarehouseId }] });
  try {
    const printerValues: Printers = JSON.parse(printerSettings.value);
    const { printers, print_server_ip } = printerValues;
    const foundPrinter = printers.find((d) => d.id === printerId);
    if (foundPrinter) {
      return {
        ...foundPrinter,
        print_server_ip,
      };
    }
    return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return null;
  }
}

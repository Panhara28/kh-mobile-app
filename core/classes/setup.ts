// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { z } from "zod";
import type { Db } from "../db/db";
import { Formatter } from "../lib/formatter";
import { createCategory, deleteCategory } from "../lib/server-functions/category/create-category";
import { HttpError } from "../lib/server-functions/customer-scope";
import { assertTableStyleFree, MAX_TAG_COUNT, parseTableMode, type TableMode } from "./table-mode";
import type { UserInfo } from "../lib/server-functions/get-auth-from-token";

/**
 * First-time setup. Registering a main branch adds a SETUP setting row; selling stays locked until it is completed.
 * A branch without that row (created before this feature, or a sub branch) counts as set up.
 */
export const SETUP_OPTION = "SETUP";

export type SetupStepKey = "store" | "type" | "currency" | "payment" | "printers" | "tables" | "halls";
export type SystemType = "MART" | "RESTAURANT" | "CINEMA";
/** LITE: a restaurant with only the basics (tables or table + tag, orders, kitchen tickets, payment, shift, simple reports). */
export type Edition = "FULL" | "LITE";

export function parseEdition(value?: string | null): Edition {
  try {
    const v = JSON.parse(value || "{}");
    return v.system_type === "RESTAURANT" && v.edition === "LITE" ? "LITE" : "FULL";
  } catch {
    return "FULL";
  }
}

export interface SetupStatus {
  complete: boolean;
  systemType: SystemType;
  edition: Edition;
  steps: { key: SetupStepKey; done: boolean; count?: number }[];
  store: { name: string; phone: string; address: string; logo: string };
  currency: string;
  exchangeRate: number;
  tableMode: TableMode;
  tagCount: number;
}

export const setupStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("store"),
    name: z.string().trim().min(3),
    phone: z.string().trim(),
    address: z.string().trim(),
    logo: z.string().trim(),
  }),
  z.object({
    step: z.literal("type"),
    systemType: z.enum(["MART", "RESTAURANT", "CINEMA"]),
    edition: z.enum(["FULL", "LITE"]).optional(),
  }),
  z.object({ step: z.literal("currency"), currency: z.enum(["USD", "KHR"]), exchangeRate: z.number().positive() }),
  z.object({ step: z.literal("payment") }),
  z.object({
    step: z.literal("printers"),
    printers: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1),
          printerName: z.string().trim().min(1),
          ip: z.string().trim().min(1),
          port: z.number().int().min(1).max(65535),
        }),
      )
      .min(1),
    categories: z.array(z.object({ categoryId: z.string(), printerId: z.string().min(1) })),
  }),
  z.object({
    step: z.literal("tables"),
    tableMode: z.enum(["NORMAL", "TAG"]),
    tagCount: z.number().int().min(1).max(MAX_TAG_COUNT),
  }),
]);
export type SetupStepInput = z.infer<typeof setupStepSchema>;

type SetupState = { confirmed: SetupStepKey[]; completedAt?: string };

function parse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

/** Setup never becomes incomplete again, so finished branches are remembered and cost no query per request. */
const finished = new Set<string>();

export class SetupService {
  constructor(
    protected db: Db,
    protected warehouseId: string,
  ) {}

  private row(option: string, warehouse: string | null = this.warehouseId) {
    return this.db.row("setting", { option, warehouse });
  }

  private async save(option: string, value: string, warehouse: string | null = this.warehouseId) {
    const row = await this.row(option, warehouse);
    if (row) await this.db.update("setting", { id: row.id }, { value });
    else await this.db.insert("setting", { option, warehouse, value });
  }

  async isComplete() {
    if (finished.has(this.warehouseId)) return true;
    const row = await this.row(SETUP_OPTION);
    const complete = !row || !!parse<SetupState>(row.value, { confirmed: [] }).completedAt;
    if (complete) finished.add(this.warehouseId);
    return complete;
  }

  async status(): Promise<SetupStatus> {
    const settings: { option: string; value: string | null }[] = await this.db.rows("setting", {
      OR: [{ warehouse: this.warehouseId }, { warehouse: null }],
    });
    const get = (option: string) => settings.find((s) => s.option === option)?.value ?? undefined;
    const setupRow = settings.find((s) => s.option === SETUP_OPTION);
    const state = parse<SetupState>(setupRow?.value, { confirmed: [] });
    const systemType = (parse(get("TYPE_POS"), { system_type: "MART" }).system_type || "MART") as SystemType;
    const tables = parseTableMode(get("TYPE_POS"));
    const warehouse = await this.db.row("warehouse", { id: this.warehouseId });

    const count = async (table: string, where: Record<string, unknown>) => {
      const r = await this.db.table(table).where(where).count("* as total").first<{ total: number }>();
      return Number(r?.total ?? 0);
    };
    const payments = await count("payment_method", { deleted_at: null });

    const confirmed = (key: SetupStepKey) => state.confirmed.includes(key);
    const steps: SetupStatus["steps"] = [
      { key: "store", done: confirmed("store") },
      { key: "type", done: confirmed("type") },
      { key: "currency", done: confirmed("currency") },
      { key: "payment", done: confirmed("payment") && payments > 0, count: payments },
    ];
    if (systemType === "RESTAURANT") {
      steps.push({ key: "printers", done: confirmed("printers") });
      const tables = await count("restaurant_tables", { warehouse_id: this.warehouseId, deleted_at: null });
      steps.push({ key: "tables", done: tables > 0, count: tables });
    }
    if (systemType === "CINEMA") {
      const halls = await count("cinema_hall", { warehouse_id: this.warehouseId, deleted_at: null });
      steps.push({ key: "halls", done: halls > 0, count: halls });
    }

    return {
      complete: !setupRow || !!state.completedAt,
      systemType,
      edition: parseEdition(get("TYPE_POS")),
      steps,
      store: {
        name: warehouse?.name ?? "",
        phone: warehouse?.phone ?? "",
        address: warehouse?.address ?? "",
        logo: (get("INVOICE_RECEIPT") ?? "").split(",")[2]?.trim() ?? "",
      },
      currency: get("CURRENCY") || "USD",
      exchangeRate: Number(get("EXCHANGE_RATE") || 0),
      tableMode: tables.mode,
      tagCount: tables.tagCount,
    };
  }

  private async hasStock() {
    return !!(await this.db
      .table("inventory")
      .innerJoin("warehouse_slot", "warehouse_slot.id", "inventory.slot_id")
      .innerJoin("product_variant", "product_variant.id", "inventory.variant_id")
      .innerJoin("product", "product.id", "product_variant.product_id")
      .where({ "warehouse_slot.warehouse_id": this.warehouseId, "product.is_for_sale": 1 })
      .whereNull("product.deleted_at")
      .where("inventory.qty", ">", 0)
      .first("inventory.variant_id"));
  }

  async saveStep(input: SetupStepInput, user: UserInfo) {
    await this.db.tx(async (tx) => {
      const self = new SetupService(tx, this.warehouseId);
      if (input.step === "store") {
        await tx.update("warehouse", { id: this.warehouseId }, {
          name: input.name,
          phone: input.phone,
          address: input.address,
          updated_by: user.id,
          updated_at: Formatter.getNowDateTime(),
        });
        // template,title,logo,... : commas separate the fields
        const receipt = ((await self.row("INVOICE_RECEIPT"))?.value || "default, , ,0 0 0 0,0,0,0").split(",");
        receipt[1] = input.name.replaceAll(",", " ");
        receipt[2] = input.logo.replaceAll(",", "%2C");
        await self.save("INVOICE_RECEIPT", receipt.join(","));
        const brand = parse<Record<string, unknown>>((await self.row("BRAND", null))?.value, {});
        await self.save("BRAND", JSON.stringify({ ...brand, title: input.name, icon: input.logo }), null);
      } else if (input.step === "type") {
        const typeRow = await self.row("TYPE_POS");
        const current = parse<Record<string, unknown>>(typeRow?.value, {});
        const next = {
          ...current,
          system_type: input.systemType,
          edition: input.systemType === "RESTAURANT" ? (input.edition ?? "FULL") : undefined,
        };
        // e.g. a mart becoming a restaurant with a stored Table + Tag style: tables must be free, like the tables step
        if (parseTableMode(typeRow?.value).mode !== parseTableMode(JSON.stringify(next)).mode) {
          await assertTableStyleFree(tx, this.warehouseId);
        }
        await self.save(
          "TYPE_POS",
          JSON.stringify({
            ...next,
            // tables share their draft orders, as in Settings > Type POS
            shared_order_draft: input.systemType === "RESTAURANT" ? true : (current.shared_order_draft ?? false),
            enviroment: current.enviroment ?? "production",
          }),
        );
        // Same as Settings > Type POS: cinemas sell from the "movies" category
        const movies = await tx.row("product_category", { id: "movies-category-id" });
        if (input.systemType === "CINEMA") {
          if (!movies || movies.delete_date) {
            await createCategory({ db: tx, input: { title: "movies", imageUrl: null, parentId: null }, user });
          }
        } else if (movies && !movies.delete_date) {
          await deleteCategory({ db: tx, id: "movies-category-id" });
        }
      } else if (input.step === "currency") {
        await self.save("CURRENCY", input.currency, null);
        await self.save("EXCHANGE_RATE", String(input.exchangeRate), null);
      } else if (input.step === "printers") {
        const ids = new Set(input.printers.map((p) => p.id));
        if (input.categories.some((c) => !ids.has(c.printerId))) throw new HttpError(400, "UNKNOWN_PRINTER");
        const current = parse<Record<string, unknown>>((await self.row("PRINT_SERVER"))?.value, {});
        await self.save(
          "PRINT_SERVER",
          JSON.stringify({
            ...current,
            printers: input.printers.map((p) => ({ id: p.id, name: p.name, printer_name: p.printerName, ip: p.ip, port: p.port })),
          }),
        );
        for (const c of input.categories) {
          const where = { warehouse_id: this.warehouseId, category_id: c.categoryId };
          if (await tx.row("warehouse_category_printer", where)) {
            await tx.update("warehouse_category_printer", { AND: [{ warehouse_id: where.warehouse_id }, { category_id: where.category_id }] }, { printer_id: c.printerId });
          } else {
            await tx.insert("warehouse_category_printer", { ...where, printer_id: c.printerId });
          }
        }
      } else if (input.step === "tables") {
        const row = await self.row("TYPE_POS");
        if (parseTableMode(row?.value).mode !== input.tableMode) await assertTableStyleFree(tx, this.warehouseId);
        await self.save(
          "TYPE_POS",
          JSON.stringify({ ...parse<Record<string, unknown>>(row?.value, {}), table_mode: input.tableMode, tag_count: input.tagCount }),
        );
      } else if (!(await tx.row("payment_method", { deleted_at: null }))) {
        throw new HttpError(400, "PAYMENT_REQUIRED");
      }
      await self.confirm(input.step);
    });
  }

  private async confirm(step: SetupStepKey) {
    const row = await this.row(SETUP_OPTION);
    if (!row) return; // already set up before this feature existed
    const state = parse<SetupState>(row.value, { confirmed: [] });
    if (!state.confirmed.includes(step)) state.confirmed.push(step);
    await this.save(SETUP_OPTION, JSON.stringify(state));
  }

  async complete() {
    const status = await this.status();
    if (status.complete) return;
    if (status.steps.some((s) => !s.done)) throw new HttpError(400, "SETUP_INCOMPLETE");
    // "Only in stock" is on by default, which would hide every product of a store that has no stock yet
    const menu = await this.row("PRODUCT_MENU");
    if (menu && !(await this.hasStock())) {
      await this.save("PRODUCT_MENU", JSON.stringify({ ...parse<Record<string, unknown>>(menu.value, {}), onlyInStock: false }));
    }
    const state = parse<SetupState>((await this.row(SETUP_OPTION))?.value, { confirmed: [] });
    await this.save(SETUP_OPTION, JSON.stringify({ ...state, completedAt: Formatter.getNowDateTime() }));
  }
}

const LOCKED = ["/api/pos", "/api/shift/open", "/api/cinema/booking", "/api/cinema/ticket-order"];

/** Throws while the branch's first-time setup is unfinished and the request would sell something. */
export async function assertSetupComplete(db: Db, pathname: string, method: string, warehouseId?: string | null) {
  if (method === "GET" || !warehouseId) return;
  if (!LOCKED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return;
  if (!(await new SetupService(db, warehouseId).isComplete())) {
    throw new HttpError(409, "Finish the store setup before selling.");
  }
}

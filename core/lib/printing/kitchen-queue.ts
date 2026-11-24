// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../db/db";
import { Formatter } from "../formatter";
import { checkNetworkPrinter } from "./network-printer";
import { printDocuments, resolvePrinter, toDocuments, type NetworkPrinter, type PrinterHint } from "./print-job";

/**
 * Prints kitchen tickets from `print_queue` on the kh-pos server. Each row is printed to its network printer, then
 * moved to `print_kitchen_log` (what the old print app did through DELETE /api/print-queue/delete).
 *
 * - Rows are claimed with SELECT ... FOR UPDATE SKIP LOCKED, so several server processes never print one twice.
 * - Each printer is handled on its own: tickets print in order per printer, printers in parallel, and a printer
 *   that doesn't answer is skipped (and re-checked with a growing delay) without holding up the others.
 */

const BATCH = 50;

interface QueueRow {
  id: number;
  content: unknown;
  printer_info: unknown;
  warehouse_id: string;
  order_id: string | null;
  order_detail_id: string | null;
  item_price: string | null;
  kind: string;
}
interface Failure {
  until: number;
  attempts: number;
  error: string;
}

/** Printers that didn't answer: skipped until `until`. Key "ip:port". */
const down = new Map<string, Failure>();
/** Tickets that failed for another reason (bad content, no printer in the settings). */
const failed = new Map<number, Failure>();

const backoff = (attempts: number) => Math.min(60000, 3000 * 2 ** (attempts - 1)); // 3 s, 6 s ... 1 min

const parse = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

async function isTestingBranch(db: Db, warehouseId: string) {
  const row = await db.row("setting", { AND: [{ option: "TYPE_POS" }, { warehouse: warehouseId }] });
  try {
    return JSON.parse(row?.value || "{}").enviroment === "testing";
  } catch {
    return false;
  }
}

function markFailed<K>(map: Map<K, Failure>, key: K, error: string, label: string) {
  const attempts = (map.get(key)?.attempts ?? 0) + 1;
  map.set(key, { until: Date.now() + backoff(attempts), attempts, error });
  if (attempts === 1 || attempts % 20 === 0) console.error(`${label} (attempt ${attempts}): ${error}`);
}

/** Prints what is queued now. Returns how many tickets were printed. */
export async function processKitchenQueue(db: Db): Promise<number> {
  let printed = 0;
  // Cheap read first: an idle queue (the usual case) shouldn't take the write lock every round.
  const waiting = await db.table("print_queue").select("id").limit(1);
  if (waiting.length === 0) return 0;
  await db.tx(async (trx) => {
    const rows: QueueRow[] = await trx.table("print_queue").orderBy("id").limit(BATCH).forUpdate().skipLocked();
    const now = Date.now();

    // group by printer, keeping queue order inside each group
    const groups = new Map<string, { printer: NetworkPrinter; items: { row: QueueRow; hint: PrinterHint }[] }>();
    for (const row of rows) {
      if ((failed.get(row.id)?.until ?? 0) > now) continue;
      const hint = parse(row.printer_info) as PrinterHint;
      try {
        const printer = await resolvePrinter(trx, row.warehouse_id, hint);
        const key = `${printer.ip}:${printer.port}`;
        if (!groups.has(key)) groups.set(key, { printer, items: [] });
        groups.get(key)!.items.push({ row, hint });
      } catch (e) {
        markFailed(failed, row.id, e instanceof Error ? e.message : String(e), `Kitchen ticket ${row.id} has no printer`);
      }
    }

    await Promise.all(
      [...groups.entries()].map(async ([key, { printer, items }]) => {
        if ((down.get(key)?.until ?? 0) > now) return;
        try {
          await checkNetworkPrinter(printer.ip, printer.port, 3000);
        } catch (e) {
          markFailed(down, key, e instanceof Error ? e.message : String(e), `Printer ${key} not reachable, ${items.length} kitchen ticket(s) waiting`);
          return;
        }
        down.delete(key);
        for (const { row, hint } of items) {
          try {
            await printDocuments(printer, toDocuments(parse(row.content)), hint);
          } catch (e) {
            markFailed(failed, row.id, e instanceof Error ? e.message : String(e), `Kitchen ticket ${row.id} not printed`);
            return; // keep this printer's tickets in order: try again next round
          }
          await trx.insert("print_kitchen_log", {
            order_id: row.order_id || "",
            order_detail_id: row.order_detail_id || "",
            item_price: row.item_price || "0",
            printed_at: Formatter.getNowDateTime(),
            content: JSON.stringify(parse(row.content)),
            printer_info: JSON.stringify(parse(row.printer_info)),
            is_testing: (await isTestingBranch(trx, row.warehouse_id)) ? 1 : 0,
            warehouse_id: row.warehouse_id,
            kind: row.kind,
          });
          await trx.del("print_queue", { id: row.id });
          failed.delete(row.id);
          printed++;
        }
      }),
    );
  });
  return printed;
}

/** Why queued tickets haven't printed yet. */
export function kitchenQueueStatus() {
  return {
    printersDown: [...down.entries()].map(([printer, v]) => ({ printer, attempts: v.attempts, error: v.error })),
    ticketsFailed: [...failed.entries()].map(([id, v]) => ({ id, attempts: v.attempts, error: v.error })),
  };
}

let started = false;

/** Started once per server process (instrumentation.ts). Set PRINT_WORKER=off to disable. */
export function startKitchenPrintWorker(getDb: () => Promise<Db>, intervalMs = 2000) {
  if (started || process.env.PRINT_WORKER === "off") return;
  started = true;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processKitchenQueue(await getDb());
    } catch (e) {
      console.error("Kitchen print worker:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  }, intervalMs);
  console.log("Kitchen print worker started");
}

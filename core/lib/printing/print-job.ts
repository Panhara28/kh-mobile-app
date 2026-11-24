// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { Db } from "../../db/db";
import { escposRaster } from "./escpos";
import { sendToNetworkPrinter } from "./network-printer";
import { posPrintDataToHtml, type PosPrintData } from "./pos-print-data";
import { renderHtmlToBitmap } from "./render";

/**
 * Printing from the kh-pos server straight to network thermal printers (raw TCP, port 9100). The printers are the
 * ones in each branch's PRINT_SERVER setting ({ id, name, printer_name, ip, port, paper_width? }).
 */

/** One printed document: self-contained HTML (receipts, labels) or drawing steps (kitchen / cinema tickets). */
export type PrintDocument = string | PosPrintData[];

export interface NetworkPrinter {
  id?: string;
  name?: string;
  printer_name?: string;
  ip: string;
  port: number;
  /** "80mm" (default) or "58mm" */
  paper_width?: string;
}

export interface PrinterHint {
  id?: string;
  name?: string;
  printer_name?: string;
  ip?: string;
  port?: number | string;
  page_size?: string;
  /** label printers: paper size in mm */
  paperSize?: { width?: number; height?: number };
}

/**
 * The documents in a print payload's `content`. The old bridge's format: a list of documents, where each is an
 * HTML string or a list of drawing steps; a flat list of drawing steps is one document.
 */
export function toDocuments(content: unknown): PrintDocument[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const isStep = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x) && "type" in (x as object);
  if (content.length && content.every(isStep)) return [content as PosPrintData[]];
  return content.flatMap((doc): PrintDocument[] =>
    typeof doc === "string" ? [doc] : Array.isArray(doc) ? [doc as PosPrintData[]] : isStep(doc) ? [[doc as PosPrintData]] : [],
  );
}

export async function getBranchPrinters(db: Db, warehouseId?: string | null): Promise<NetworkPrinter[]> {
  if (!warehouseId) return [];
  const row = await db.row("setting", { AND: [{ option: "PRINT_SERVER" }, { warehouse: warehouseId }] });
  try {
    const printers = JSON.parse(row?.value || "{}").printers;
    return Array.isArray(printers)
      ? printers.filter((p) => p?.ip).map((p) => ({ ...p, port: Number(p.port) || 9100 }))
      : [];
  } catch {
    return [];
  }
}

/** Which printer a job goes to: by id, then by name, then the address in the job, then the branch's only printer. */
export async function resolvePrinter(
  db: Db,
  warehouseId: string | null | undefined,
  hint: PrinterHint | PrinterHint[] | null | undefined,
): Promise<NetworkPrinter> {
  const h: PrinterHint = (Array.isArray(hint) ? hint[0] : hint) || {};
  const printers = await getBranchPrinters(db, warehouseId);
  const name = (h.printer_name || h.name || "").trim().toLowerCase();
  const found =
    (h.id && printers.find((p) => p.id === h.id)) ||
    (name && printers.find((p) => [p.printer_name, p.name].some((n) => (n || "").trim().toLowerCase() === name)));
  if (found) return found;
  if (h.ip) return { ip: h.ip, port: Number(h.port) || 9100, name: h.name, printer_name: h.printer_name };
  if (printers.length === 1) return printers[0];
  throw new Error(
    printers.length
      ? `No printer named "${h.printer_name || h.name || ""}" in this branch's printer settings`
      : "This branch has no network printer set up (Settings → Print Server)",
  );
}

const MM_TO_CSS_PX = 96 / 25.4;
const DOTS_PER_MM = 8; // 203 dpi thermal heads

function paperFor(printer: NetworkPrinter, hint: PrinterHint): { cssWidth: number; widthDots: number } {
  if (hint.paperSize?.width) {
    const mm = Number(hint.paperSize.width);
    return { cssWidth: mm * MM_TO_CSS_PX, widthDots: mm * DOTS_PER_MM };
  }
  const page = (hint.page_size || printer.paper_width || "80mm").toLowerCase();
  // printable width: 80mm paper → 72mm (576 dots), 58mm paper → 48mm (384 dots)
  return page.startsWith("58") || page.startsWith("57")
    ? { cssWidth: 200, widthDots: 384 }
    : { cssWidth: 280, widthDots: 576 };
}

/** Renders every document and sends them to the printer in one connection (each document is cut). */
export async function printDocuments(
  printer: NetworkPrinter,
  documents: PrintDocument[],
  hint: PrinterHint = {},
): Promise<void> {
  if (!documents.length) throw new Error("Nothing to print");
  const paper = paperFor(printer, hint);
  const jobs: Buffer[] = [];
  for (const doc of documents) {
    const html = typeof doc === "string" ? doc : await posPrintDataToHtml(doc);
    const bitmap = await renderHtmlToBitmap(html, paper);
    jobs.push(escposRaster(bitmap));
  }
  await sendToNetworkPrinter(printer.ip, printer.port, Buffer.concat(jobs));
}

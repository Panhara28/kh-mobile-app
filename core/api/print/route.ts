// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { printDocuments, resolvePrinter, toDocuments, type PrinterHint } from "../../lib/printing/print-job";
import { productLotDocuments, type ProductLotLabel } from "../../lib/printing/product-lot";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  /** One or more documents: HTML strings, or lists of drawing steps (see print-job.ts) */
  content: z.unknown(),
  /** Which printer: { id } / { printer_name } from the branch's printer settings, or { ip, port } */
  printer_info: z.unknown().optional(),
});

export type PrintResponse = ResponseType<{ printer: string }>;

/**
 * Prints on a network printer from the kh-pos server (receipts, labels, tickets). Replaces the per-device print
 * socket: the browser only sends the job here.
 */
export const POST = withAuthApi<unknown, z.infer<typeof inputSchema>, PrintResponse>(
  async ({ db, body, userAuth }) => {
    const input = inputSchema.parse(body);
    const hint = (input.printer_info ?? {}) as PrinterHint;
    try {
      const printer = await resolvePrinter(db, userAuth.admin?.currentWarehouseId, hint);
      const first = (Array.isArray(hint) ? hint[0] : hint) as PrinterHint & { type?: string };
      // Product lots may arrive as raw lot data (the mobile app, and the old print app's format): lay them out here.
      const documents =
        first?.type === "product_lot" && Array.isArray(input.content) && input.content.every((c) => c && typeof c === "object" && "lotId" in c)
          ? productLotDocuments(input.content as ProductLotLabel[])
          : toDocuments(input.content);
      await printDocuments(printer, documents, first);
      return NextResponse.json({
        success: true,
        result: { printer: `${printer.name || printer.printer_name || "Printer"} (${printer.ip}:${printer.port})` },
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  },
);

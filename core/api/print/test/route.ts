// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../../lib/formatter";
import { checkNetworkPrinter } from "../../../lib/printing/network-printer";
import { printDocuments, resolvePrinter, type PrinterHint } from "../../../lib/printing/print-job";
import { PRINT_FONT_STACK } from "../../../lib/printing/pos-print-data";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSchema = z.object({
  id: z.string().optional(),
  printer_name: z.string().optional(),
  ip: z.string().optional(),
  port: z.union([z.number(), z.string()]).optional(),
  /** also print a test ticket (otherwise only checks the printer answers) */
  print: z.boolean().optional(),
});

/** Checks a network printer from the server, optionally printing a test ticket (Khmer, English and a QR code). */
export const POST = withAuthApi<unknown, z.infer<typeof inputSchema>, ResponseType<{ message: string }>>(
  async ({ db, body, userAuth }) => {
    const input = inputSchema.parse(body ?? {});
    try {
      const printer = await resolvePrinter(db, userAuth.admin?.currentWarehouseId, input as PrinterHint);
      await checkNetworkPrinter(printer.ip, printer.port);
      if (input.print) {
        const text = (value: string, size = 18, align = "left") => ({
          type: "text",
          value,
          style: { fontSize: `${size}px`, fontWeight: "bold", textAlign: align, fontFamily: PRINT_FONT_STACK },
        });
        await printDocuments(printer, [
          [
            text("Test print / សាកល្បងបោះពុម្ព", 22, "center"),
            text(`${printer.name || printer.printer_name || "Printer"} · ${printer.ip}:${printer.port}`, 16, "center"),
            text(Formatter.getNowDateTime(), 16, "center"),
            text("--------------------------------", 16, "center"),
            text("តុលេខ: 01   ចំនួន: x2"),
            text("ទំនិញ: បាយឆាសាច់មាន់"),
            { type: "qrCode", value: "kh-pos print test", width: "120", position: "center" },
          ],
        ]);
      }
      return NextResponse.json({
        success: true,
        result: { message: `${input.print ? "Printed on" : "Connected to"} ${printer.name || printer.printer_name || "the printer"} (${printer.ip}:${printer.port})` },
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  },
);

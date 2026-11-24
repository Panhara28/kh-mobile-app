// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Printer, PrintServer } from "../../classes/print-server";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";
import { launchBrowser } from "../../lib/browser";
import os from "os";
import path from "path";
import fs from "fs/promises";

export const GET = withAuthApi<unknown, unknown, ResponseType<Printer[]>>(
  async ({ db, userAuth }) => {
    const printers = await new PrintServer(
      db,
      userAuth.admin!
    ).getAllPrinters();
    return NextResponse.json({
      result: printers,
      success: true,
    });
  }
);

export const POST = withAuthApi<
  unknown,
  { html: string; printerName?: string },
  ResponseType<{ pdfPath: string; message: string }>
>(async ({ body }) => {
  try {
    const { html } = body || {};
    const css = await fs.readFile(
      path.resolve(process.cwd(), "assets", "printing.css"),
      "utf-8"
    );

    const framedHtml = `
      <html>
      <head>
        <style>${css}</style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;

    if (!html) {
      return NextResponse.json(
        {
          success: false,
          error: "HTML content is required",
        },
        { status: 400 }
      );
    }

    if (process.env.VERCEL) {
      // Printing to a printer attached to the server machine only works on an on-premise API.
      return NextResponse.json(
        { success: false, error: "Server-attached printing is not available on the cloud deployment" },
        { status: 501 },
      );
    }
    const { print } = await import("pdf-to-printer");
    const browser = await launchBrowser({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 576, height: 800 });
    await page.setContent(framedHtml, { waitUntil: "load" });

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const pdfPath = path.resolve(
      os.tmpdir(),
      `receipt_${timestamp}.pdf`
    );

    await page.pdf({
      path: pdfPath,
      width: "80mm", // ensures correct thermal width
      printBackground: true,
      margin: {
        top: "0mm",
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
      },
    });

    await browser.close();

    // Print to the specified or default printer
    await print(pdfPath, {
      printer: "Print to Chasier",
      sumatraPdfPath: "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
    });

    await fs.unlink(pdfPath);

    return NextResponse.json({
      success: true,
      result: {
        pdfPath,
        message: `Successfully printed to Print to Chasier`,
      },
    });
  } catch (error) {
    console.error("Printing error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown printing error",
      },
      { status: 500 }
    );
  }
});

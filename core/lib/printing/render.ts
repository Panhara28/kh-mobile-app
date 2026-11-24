// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/// <reference lib="dom" />
import { launchBrowser, type Browser } from "../browser";
import type { MonoBitmap } from "./escpos";

/**
 * Renders a self-contained HTML document to a 1-bit bitmap with headless Chrome (puppeteer), at the printer's
 * resolution. The page is laid out `cssWidth` CSS pixels wide and scaled so that width becomes `widthDots`
 * printer dots, so mm and px in the receipt CSS come out at their real size on the paper.
 */

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser?.connected) return browser;
  }
  browserPromise = launchBrowser({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
  return browserPromise;
}

/** Light grey and lighter print as white; anything darker as black. */
const THRESHOLD = 170;

export async function renderHtmlToBitmap(
  html: string,
  options: { cssWidth: number; widthDots: number },
): Promise<MonoBitmap> {
  const widthDots = Math.max(8, Math.floor(options.widthDots / 8) * 8);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: Math.round(options.cssWidth),
      height: 200,
      deviceScaleFactor: widthDots / options.cssWidth,
    });
    // Paper is white: without this a transparent page (receipts set no background) renders on Chrome's dark
    // canvas when the server's system is in dark mode, and prints solid black.
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    // Printed content never needs scripts; block them (CDP evaluate below still works).
    const csp =
      `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">` +
      `<style>html{background:#fff;color-scheme:light}</style>`;
    const guarded = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${csp}`)
      : `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}</head><body>${html}</body></html>`;
    await page
      .setContent(guarded, { waitUntil: "load", timeout: 8000 })
      .catch(() => {
        // a slow logo or web font: print with what has loaded
      });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);

    const png = await page.screenshot({ type: "png", fullPage: true, omitBackground: false, encoding: "base64" });

    const packed = await page.evaluate(
      async (dataUrl: string, width: number, threshold: number) => {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("could not decode the rendered ticket"));
          img.src = dataUrl;
        });
        const height = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        const bytesPerRow = width / 8;
        const out = new Uint8Array(bytesPerRow * height);
        let lastInk = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum < threshold) {
              out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
              lastInk = y;
            }
          }
        }
        // trim blank paper below the last printed line
        const rows = Math.max(1, lastInk + 8 < height ? lastInk + 8 : height);
        let binary = "";
        const used = out.subarray(0, rows * bytesPerRow);
        for (let i = 0; i < used.length; i += 0x8000) {
          binary += String.fromCharCode(...used.subarray(i, i + 0x8000));
        }
        return { height: rows, bits: btoa(binary) };
      },
      `data:image/png;base64,${png}`,
      widthDots,
      THRESHOLD,
    );

    return { width: widthDots, height: packed.height, bits: new Uint8Array(Buffer.from(packed.bits, "base64")) };
  } finally {
    await page.close().catch(() => undefined);
  }
}

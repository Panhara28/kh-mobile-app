// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * Headless Chrome for PDF/receipt rendering. On Vercel (and other serverless hosts) it uses the
 * @sparticuz/chromium build; locally it uses an installed Chrome/Edge (CHROME_PATH overrides).
 */
import { existsSync } from "fs";
import { join } from "path";
import type { Browser, LaunchOptions } from "puppeteer-core";

const LOCAL_CANDIDATES = [
  process.env.CHROME_PATH,
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
  String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export async function launchBrowser(opts: { args?: string[] } & Omit<LaunchOptions, "args"> = {}): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  if (serverless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      ...opts,
      args: [...chromium.args, ...(opts.args ?? [])],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath = LOCAL_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome found for PDF rendering; set CHROME_PATH");
  return puppeteer.launch({ headless: true, ...opts, args: opts.args ?? [], executablePath });
}

export type { Browser };

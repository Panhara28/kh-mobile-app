// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import QRCode from "qrcode";

/**
 * Print documents written as a list of drawing steps (the electron-pos-printer "PosPrintData" format the old
 * print bridge understood: kitchen tickets, cinema tickets, test tickets), turned into one HTML document.
 */
export interface PosPrintData {
  type: string;
  value?: string;
  style?: Record<string, string | number> | string;
  css?: Record<string, string | number>;
  url?: string;
  path?: string;
  width?: string | number;
  height?: string | number;
  position?: "left" | "center" | "right";
  displayValue?: boolean;
  tableHeader?: unknown[];
  tableBody?: unknown[][];
  tableFooter?: unknown[];
}

/** Khmer first, then fonts the server is likely to have (Docker installs fonts-khmeros). */
export const PRINT_FONT_STACK = `'Noto Sans Khmer', 'Kantumruy Pro', 'Khmer OS', 'Khmer OS System', Hanuman, 'Courier New', Courier, monospace`;
const FONTS_CSS = `@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@100..900&family=Kantumruy+Pro:wght@100..700&display=swap");`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function styleAttr(style: PosPrintData["style"] | PosPrintData["css"]): string {
  if (!style) return "";
  if (typeof style === "string") return escapeHtml(style);
  return escapeHtml(
    Object.entries(style)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
      .join(";"),
  );
}

const size = (v: string | number | undefined) =>
  v === undefined || v === "" ? undefined : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}px` : String(v);

const align = (p?: string) => (p === "left" || p === "right" ? p : "center");

async function stepToHtml(step: PosPrintData): Promise<string> {
  const css = [styleAttr(step.style), styleAttr(step.css)].filter(Boolean).join(";");
  switch (step.type) {
    case "text":
      // Values are plain text from kh-pos (item names, notes, table numbers): escape them.
      return `<div style="${css}">${escapeHtml(String(step.value ?? "")).replace(/\n/g, "<br>")}</div>`;
    case "image": {
      const src = step.url || step.path;
      if (!src) return "";
      const w = size(step.width);
      const h = size(step.height);
      return `<div style="text-align:${align(step.position)}"><img src="${escapeHtml(src)}" style="${[
        w && `width:${w}`,
        h && `height:${h}`,
        "object-fit:contain",
        css,
      ]
        .filter(Boolean)
        .join(";")}"></div>`;
    }
    case "qrCode": {
      const value = String(step.value ?? "");
      if (!value) return "";
      const w = size(step.width) || "150px";
      const dataUrl = await QRCode.toDataURL(value, { margin: 1, width: 300 });
      return `<div style="text-align:${align(step.position)};${css}"><img src="${dataUrl}" style="width:${w};height:${size(step.height) || w};image-rendering:pixelated"></div>`;
    }
    case "table": {
      const cell = (c: unknown) => `<td>${escapeHtml(typeof c === "object" && c !== null ? String((c as { value?: unknown }).value ?? "") : String(c ?? ""))}</td>`;
      const row = (r: unknown[]) => `<tr>${r.map(cell).join("")}</tr>`;
      return `<table style="width:100%;border-collapse:collapse;${css}">${
        step.tableHeader ? `<thead>${row(step.tableHeader)}</thead>` : ""
      }<tbody>${(step.tableBody ?? []).map(row).join("")}</tbody>${step.tableFooter ? `<tfoot>${row(step.tableFooter)}</tfoot>` : ""}</table>`;
    }
    default:
      return ""; // barCode and others are not used by kh-pos
  }
}

export async function posPrintDataToHtml(steps: PosPrintData[]): Promise<string> {
  const body = (await Promise.all(steps.map(stepToHtml))).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS_CSS}
html,body{margin:0;padding:0;background:#fff;color:#000}
body{padding:4px 2px;font-family:${PRINT_FONT_STACK};font-size:14px;line-height:1.35;word-break:break-word}
img{max-width:100%}</style></head><body>${body}</body></html>`;
}

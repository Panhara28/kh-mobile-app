// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { PosPrintData } from "./pos-print-data";

/** A product lot as the inventory screens pass it to the printer. */
export interface ProductLotLabel {
  lotNumber: string;
  expirationDate: string;
  sku: string;
  lotId: string;
  price: string;
  manufacturingDate: string;
  slot: string;
}

const FONT = `'Noto Sans Khmer', 'Kantumruy Pro', Hanuman, 'Courier New', Courier, monospace`;
const line = (value: string, size = 16, align = "left", bold = true): PosPrintData => ({
  type: "text",
  value,
  style: { fontSize: `${size}px`, fontWeight: bold ? "bold" : "normal", textAlign: align, fontFamily: FONT },
});

/** One printed label per lot: its QR code (the lot id, which kh-pos scans) and the lot's details. */
export function productLotDocuments(lots: ProductLotLabel[]): PosPrintData[][] {
  return lots.map((lot) => [
    { type: "qrCode", value: lot.lotId, width: "140", position: "center" },
    line(lot.lotNumber, 18, "center"),
    line(`SKU: ${lot.sku}`),
    line(`EXP: ${lot.expirationDate}`),
    line(`MFG: ${lot.manufacturingDate}`),
    line(`Price: ${lot.price}`),
    line(`Slot: ${lot.slot}`, 14, "left", false),
  ]);
}

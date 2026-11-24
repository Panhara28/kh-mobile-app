// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
/**
 * ESC/POS for network thermal printers: the whole ticket is sent as one raster image, so Khmer text, logos and
 * QR codes print exactly as rendered (thermal printers have no Khmer font of their own).
 */

export interface MonoBitmap {
  /** Width in dots; a multiple of 8. */
  width: number;
  height: number;
  /** 1 bit per dot, 1 = black, rows of width/8 bytes, most significant bit first. */
  bits: Uint8Array;
}

const ESC = 0x1b;
const GS = 0x1d;

/** Rows per GS v 0 command: some printers reject very tall single images. */
const BAND_ROWS = 255;

export function escposRaster(
  bitmap: MonoBitmap,
  options: { feedLines?: number; cut?: boolean } = {},
): Buffer {
  const { feedLines = 4, cut = true } = options;
  const bytesPerRow = bitmap.width / 8;
  const parts: Buffer[] = [Buffer.from([ESC, 0x40])]; // initialise

  for (let y = 0; y < bitmap.height; y += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, bitmap.height - y);
    parts.push(
      Buffer.from([
        GS, 0x76, 0x30, 0x00, // GS v 0, normal density
        bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
        rows & 0xff, (rows >> 8) & 0xff,
      ]),
      Buffer.from(bitmap.bits.subarray(y * bytesPerRow, (y + rows) * bytesPerRow)),
    );
  }

  parts.push(Buffer.from([ESC, 0x64, feedLines])); // feed so the cut is below the last line
  if (cut) parts.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // partial cut
  return Buffer.concat(parts);
}

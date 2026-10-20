import qrGenerator from 'qrcode-generator';

/**
 * QR codes of the web restaurant page: the table's menu link (customers scan it to order) and the invoice link
 * of an open order. Same addresses as kh-pos `table-qr-code.tsx` and `invoice-qr-code.tsx`, built from the
 * server address the phone is set to.
 */

const trimEnd = (base: string) => base.replace(/\/+$/, '');

/** `<server>/menu?warehouse=<branch>&table=<table>` */
export function tableMenuLink(baseUrl: string, warehouseId: string | null | undefined, tableId: string): string {
  return `${trimEnd(baseUrl)}/menu?warehouse=${warehouseId ?? ''}&table=${tableId}`;
}

/** `<server>/invoice?warehouse=<branch>&order=<order>` */
export function invoiceLink(baseUrl: string, warehouseId: string | null | undefined, orderId: string): string {
  return `${trimEnd(baseUrl)}/invoice?warehouse=${warehouseId ?? ''}&order=${orderId}`;
}

/** The dark squares of the code, row by row. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrGenerator(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export interface QrRun {
  start: number;
  length: number;
}

/** Each row as runs of dark squares, so a code is drawn with a few views instead of one per square. */
export function qrRuns(matrix: boolean[][]): QrRun[][] {
  return matrix.map((row) => {
    const runs: QrRun[] = [];
    let start = -1;
    row.forEach((dark, i) => {
      if (dark && start < 0) start = i;
      if (!dark && start >= 0) {
        runs.push({ start, length: i - start });
        start = -1;
      }
    });
    if (start >= 0) runs.push({ start, length: row.length - start });
    return runs;
  });
}

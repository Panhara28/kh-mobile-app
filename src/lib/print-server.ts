/**
 * The print-server bridge (l-print-electron) of the web POS, from the phone: a small WebSocket server on the PC wired
 * to the printer. A job is one JSON text: `{content: [...], printer_info: {...}}`. Ported from kh-pos
 * `classes/cinema/printing.ts` and `lib/receipt-print-bridge.ts`.
 */

/** The bridge closes the socket with this code when the ?token=... in the address is missing or wrong. */
export const UNAUTHORIZED_CODE = 4401;

/** The width a receipt is sized to, a little under the printer's real printable width (kh-pos SAFE_PRINTABLE_WIDTH_MM). */
const SAFE_WIDTH_MM: Record<string, number> = { '80mm': 70, '78mm': 68, '76mm': 66, '58mm': 46, '57mm': 45, '44mm': 34 };

/** A receipt as one print job for the bridge (HTML printed silently on the named printer). */
export function receiptJob(innerHtml: string, printerName: string, pageSize = '80mm'): string {
  const width = SAFE_WIDTH_MM[pageSize];
  const widthStyle = width ? `<style>html,body{width:${width}mm;max-width:${width}mm;margin:0;overflow-x:hidden;box-sizing:border-box;}</style>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${widthStyle}</head><body>${innerHtml}</body></html>`;
  return JSON.stringify({ content: [html], printer_info: { printer_name: printerName, type: 'data:text/html', page_size: pageSize } });
}

/** The Inventory "Print" test: a sample product lot label. */
export function productLotTestJob(printerName: string): string {
  const sample = { lotNumber: 'LOT-2025-0042', expirationDate: '2026-12-31', sku: 'SKU-8809253649255', lotId: '3af64575-8a9c-452e-8004-17e4fd921277', price: '$9.99', manufacturingDate: '2025-01-15', slot: 'SLOT-A01' };
  return JSON.stringify({ content: [sample], printer_info: { printer_name: printerName, type: 'product_lot', size: 'big' } });
}

const KHMER_MONO = "Hanuman, 'Courier New', Courier, monospace";
const textItem = (value: string, fontSize: string, textAlign: string, extra: Record<string, string> = {}) => ({
  type: 'text',
  value,
  style: { fontSize, fontFamily: KHMER_MONO, fontWeight: 'bold', textAlign, ...extra },
});

/** The Print Socket "Print" test: a sample cinema ticket. `now` is injected so it can be tested. */
export function ticketTestJob(printer: { id?: string; name: string; printer_name: string; ip: string; port: number }, now: { date: string; time: string }): string {
  const ticket = [
    textItem('Sample Movie Title', '20px', 'left'),
    textItem('Cinema: Sample Cinema Name', '16px', 'left'),
    textItem('Hall: Sample Hall Name', '16px', 'left'),
    textItem('Seat: A1 (Regular)', '16px', 'left'),
    textItem(`Date: ${now.date}`, '16px', 'left'),
    textItem(`Time: ${now.time} - ${now.time}`, '16px', 'left', { fontStyle: 'uppercase' }),
    textItem('--------------------------------', '20px', 'center'),
    { type: 'qrCode', value: 'ASs234as', height: '150', width: '150', position: 'center', style: { margin: '0 0 0 0' }, displayValue: true },
    textItem('ASs234as', '16px', 'center'),
  ];
  return JSON.stringify({ content: [ticket], printer_info: printer });
}

export interface PrintResult {
  ok: boolean;
  /** Short, user-facing explanation. */
  message: string;
  /** The bridge refused the access token. */
  unauthorized?: boolean;
}

/** The part of WebSocket the client uses (so a fake can stand in for tests). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketLike;

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

/** A ws:// or wss:// address (an access token goes after "?token="). */
export function isPrintUrl(url: string): boolean {
  const v = url.trim();
  return /^wss?:\/\/[^\s/]+/i.test(v);
}

/**
 * Opens a socket, reports whether the bridge is reachable and accepts us. The bridge sends {type:"welcome"} right
 * after accepting and {type:"error"} + close(4401) when it refuses; with neither, an open socket counts as connected.
 */
export function testConnection(url: string, factory: SocketFactory = defaultFactory, timeoutMs = 6000): Promise<PrintResult> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: SocketLike | null = null;
    let openFallback: ReturnType<typeof setTimeout> | null = null;
    const finish = (r: PrintResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (openFallback) clearTimeout(openFallback);
      try {
        ws?.close();
      } catch {
        // already closed
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'No response from the print server (timed out)' }), timeoutMs);
    try {
      ws = factory(url);
    } catch (e) {
      finish({ ok: false, message: e instanceof Error ? e.message : 'That URL is not valid' });
      return;
    }
    ws.onopen = () => {
      openFallback = setTimeout(() => finish({ ok: true, message: 'Connected to the print server' }), 1500);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data?.type === 'welcome') finish({ ok: true, message: data.message || 'Connected to the print server' });
        else if (data?.type === 'error') finish({ ok: false, message: data.message || 'The print server rejected the request' });
      } catch {
        // not JSON: wait for the welcome or the timeout
      }
    };
    ws.onerror = () => finish({ ok: false, message: 'Could not reach the print server at this address' });
    ws.onclose = (event) =>
      finish(
        event.code === UNAUTHORIZED_CODE
          ? { ok: false, unauthorized: true, message: "Access token rejected - check the token in the print app's Device access security" }
          : { ok: false, message: event.reason || 'The print server closed the connection' },
      );
  });
}

/**
 * Sends one job and closes. Done when the bridge has accepted the socket and the text is on the wire; the bridge
 * does not answer a job, so the phone cannot know the paper came out.
 */
export function sendJob(url: string, job: string, factory: SocketFactory = defaultFactory, timeoutMs = 6000, settleMs = 400): Promise<PrintResult> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: SocketLike | null = null;
    const finish = (r: PrintResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'No response from the print server (timed out)' }), timeoutMs);
    try {
      ws = factory(url);
    } catch (e) {
      finish({ ok: false, message: e instanceof Error ? e.message : 'That URL is not valid' });
      return;
    }
    ws.onopen = () => {
      try {
        ws!.send(job);
        // give the bridge a moment to refuse (wrong token closes with 4401) before calling it sent
        setTimeout(() => finish({ ok: true, message: 'Sent to the print server' }), settleMs);
      } catch (e) {
        finish({ ok: false, message: e instanceof Error ? e.message : 'Could not send to the print server' });
      }
    };
    ws.onerror = () => finish({ ok: false, message: 'Could not reach the print server at this address' });
    ws.onclose = (event) =>
      finish(
        event.code === UNAUTHORIZED_CODE
          ? { ok: false, unauthorized: true, message: 'Print server rejected the connection - wrong or missing access token' }
          : { ok: false, message: event.reason || 'The print server closed the connection' },
      );
  });
}

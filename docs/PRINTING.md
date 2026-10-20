# Printing: web vs phone

Phone: `lib/print-server.ts` (the WebSocket client), `lib/print.ts` (receipts follow the device setting), `ui/scan-print-url.tsx` (QR scan), `app/account.tsx` (Profile > Print & Device Settings), test buttons in `ui/settings/editors.tsx`. **Never tried against a real print bridge or printer**; the client is tested with a fake socket (connect, welcome, refused token, error, timeout, send).

The web talks to the **print bridge** (l-print-electron), a WebSocket server on the PC wired to the printer. A job is one JSON text, `{content: [...], printer_info: {...}}`. The address is per device; an access token goes in the address, `ws://192.168.1.20:8181/?token=SHOP-1234`.

| Web | Phone |
|---|---|
| Print Server address (this device), Test, Save, Reset | Same; Test opens a socket and reports connected (welcome message), refused token (close code 4401), unreachable or timeout |
| Scan (the QR on the print app's Device Connection card holds the address) | Scan with the camera, or paste the address |
| Receipt printing: Browser print or Print server (WebSocket), printer name | "Phone print" or "Print server" and a printer name |
| Receipt with method Print server: sends the receipt as HTML (`type: data:text/html`, `page_size 80mm`, sized a little under the printable width) | Same job for the receipt and the shift handover receipt. With no printer chosen it prints through the phone dialog and says so |
| Settings > Inventory "Print" sample product-lot label; Print Socket "Print" sample cinema ticket | Same sample jobs |

**Differences:** the bridge does not answer a print job, so the phone can only say "sent", not that paper came out. The receipt HTML is the phone's own layout (`lib/receipt.ts`), not the web invoice templates (Template I / CH / Funbeerking), so a receipt from the phone looks different from the web's. Product labels and the End of Day report still use the phone print dialog.

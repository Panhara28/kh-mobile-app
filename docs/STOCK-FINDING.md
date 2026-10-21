# Finding and Transfer: web app vs phone

Checked against the web source (`src/components/gui/transfer-stock/*`, `api/inventory/transfer`, `api/unit-conversion`, `api/replenishment/new/stock-picking-list`) on 2026-10-20. The draft-order list and the picking list were read from the running server (22 drafts; their picking lists are empty, because those dishes keep no stock). **No transfer or conversion was sent, and the screen has not been opened on a phone.** The transfer and conversion requests were built from the web code and checked by unit tests only.

Phone: `app/stock-finding.tsx` (More > Daily > Finding and Transfer, permission `transfer`), `lib/stock-finding.ts`. This screen did not exist before.

| Web | Phone |
|---|---|
| "Stock Finding": draft orders (first 30), search by invoice number | Same |
| Row: invoice, date, products, quantity, total, who transferred ("Transferred" badge), Detail | Same, as cards |
| Detail "Invoice #N - Stock Transfer": picking list for the order lines (with conversion) | Same request |
| Items to Transfer (stock in a non-POS slot), **Transfer All** after "Transfer Confirmation", one move per item into the POS slot with the order id | Same |
| Items for Conversion (BREAK / REPACK / MIXED) with expandable breakdown / repack sources, **Convert** per item and **Convert All** | Same, with the same validation messages and success line |
| Unavailable Items (red) with the server's message; Available Items (green, already in the POS slot) | Same |
| After each action the order and the picking list are read again | Same |

**Differences:** the web opens the detail in a side sheet; the phone uses a full-screen sheet. The web desktop table and mobile cards both exist; the phone has cards only.

**Offline:** the draft list is read from the saved copy; the picking list, transfers and conversions need the server.

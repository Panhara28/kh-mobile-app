# Customer Order: web app vs phone

Checked against the web source (`src/components/gui/order/*`, `src/app/api/pos/order*`, `pos/return`) on 2026-10-20. The order list was read from the running server (20,508 orders). **The screens have not been opened on a phone**, and no order was changed on the server.

Phone: `app/orders.tsx` (list), `app/order/[id].tsx` (details), `lib/orders.ts`.

| Web | Phone |
|---|---|
| Header "New Order" (opens the POS or Restaurant) | "+ New Order" (Tables if the role may use them, else Retail) |
| Summary cards over the whole period (up to 10,000 orders): Completed, Draft, Expected Revenue, and one per served type (Dine In, Take Away, Delivery, Customer, Unknown), biggest first | Same; the old screen summed only the orders already loaded |
| Search by Invoice Number (digits only) / Customer Phone / Ticket Code (cinema only); searching drops the status filter | Same |
| Status: All, Draft, Completed | Same (the old screen also offered four more statuses) |
| "My Shift Only" when a shift is open | Same |
| Date range (today by default), reset button | Same |
| Row: invoice, date + time (paid, else created), status, item count, total, created by or the customer (name, phone, email) | Same, as cards |
| Row menu: Print Receipt (n), View Details, Open in Restaurant (a draft on a table), Reverse to Draft (completed) | Same buttons. Print Receipt counts the print on the server, then opens the order with its receipt |
| Reverse to Draft dialog (status change, payments removed, stock back, fulfilment removed) | Same warning, then opens the table when the order had one |
| Empty state with an "Open POS / Restaurant" button | Same |
| Details: lines with add-ons and returns, subtotal, discount, total, payments, received, change, Return portions, Print Receipt | Already matched; unchanged |

**Differences:** a draft retail (no table) order cannot be reopened on the phone, because the phone's Retail screen always starts a new sale; the web opens it in the POS. The web details show a fixed "Tax Included (10%)" line; the phone does not. The date range is the phone's day-picker bar instead of the web's calendar.

**Security fix (kh-pos leaks tokens):** `GET /api/pos/order` and `/api/pos/order/{id}` return the creator's whole user record including their login `token` for every order (also in product groups). The phone's saved copies would have stored those tokens. Every answer from kh-pos now has `token` keys removed before use or saving (`lib/redact.ts`), except the login answer. kh-pos itself still sends them and should stop.

**Offline:** the list and the summary are read from the saved copy; print count, reverse and returns need the server.

# Replenishment: web app vs phone

Checked against the web source (`src/components/gui/replenishment/*`, `suggest/*`, `src/app/api/replenishment/*`) on 2026-10-20. The local database has no replenishments and no branch is under its stock level (the suggestion list is empty), so the screens were checked from source; every request body the phone builds (create, update, picking list, suggestions) was parsed with the server's schemas. **The screens have not been opened on a phone, and nothing was saved to the server.**

Phone: `app/replenishments.tsx` (list), `app/replenishment/[id].tsx` (details; `new` and `?edit=1` open the form), `app/replenishment/suggest.tsx`, `ui/replenishment/rep-form.tsx`, `lib/replenishment.ts`.

| Web | Phone |
|---|---|
| Main branch sees what it sends; another branch only what is sent to it (`toWarehouseId`) | Same |
| Tabs All / Draft (main only) / Approved / Receiving / Received | Same |
| Row: TR-0001 code, To Warehouse (main) or From Warehouse, status, created at, total sent, total received, total cost | Same, as cards |
| Row menu: Edit and Delete for a draft on the main branch (Delete asks "Delete Replenishment / Are you sure you want to delete this replenishment?"); Details for everything that is not a draft | Same |
| Add New and the refresh (suggestions) button, main branch only | "+ Add New" and "Suggestions" in the header |
| Create / Edit form: source = main branch (fixed), destination, products found with the replenishment product search (stock of this branch), quantity (starts at 0), cost per unit (starts at the price), amount, per item the picking list (slot, lot, quantity, expiry, message), Check Stock, Save (stores the picking list too) | Same; an old draft opened without a picking list gets one at once |
| Details: General Information (status, created by / at, from, to, total items, total cost, sent, received), items with sent / cost / received / remaining, the picking list for the sending branch, Approve (main) or Receive per item (other branch) with slot, quantity, cost, expiry | Same. Approve is blocked until every lot is verified when "restrict product lot" is on and the picking list has lots |
| Product Replenishment page: per branch the products it is low on (your stock, its stock, low, ideal, to stock in), tick items (only those you hold), quantity to send (ideal level if below your stock, else all you hold), cost, totals, Create makes a draft | Same: `replenishment/suggest` |

**Differences:** the web Approve button is also in the edit sheet (with a scan dialog for lots); on the phone approving is in the details, where each lot is verified by tapping it or typing its lot number. The web prints a replenishment from the sheet; the phone does not print it yet. The old phone form had a "Send now" button that created an already approved replenishment; the web has none, so it is removed.

**Offline:** lists are read from the saved copy; saving, approving, receiving and deleting need the server.

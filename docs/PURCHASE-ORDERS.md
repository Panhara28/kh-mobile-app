# Purchase Order: web app vs phone

Checked against the web source (`src/components/gui/purchase-order/*`, `src/app/api/purchase-order/*`) on 2026-10-20. The local database has **no purchase orders**, so nothing could be read; every request body the phone builds (create, edit, approve, receive, cancel remaining) was checked against the server's zod schemas with a script. **The screens have not been opened on a phone, and nothing was saved to the server.**

Phone: `app/purchase-orders.tsx` (list), `app/purchase-order/[id].tsx` (details; `new` and `?edit=1` open the form), `ui/purchase/po-form.tsx`, `ui/purchase/receive-sheet.tsx`, `lib/purchase.ts`.

| Web | Phone |
|---|---|
| List for the current store, filter All / Draft / Approved / Completed / Closed | Same (the old list asked for every store) |
| Row: ID, date, supplier, store, status, "Receiving 3 of 10", expected on, received total / total | Same, as cards |
| Row menu: Approve (draft) or View Details; Create Receive (approved); Edit and Delete (until completed) | Buttons with the same rules. The phone had no Edit before |
| Delete asks "Delete Purchase Order / Are you sure? you want to delete this purchase order?" | Same |
| Details: number and status, progress bar, order information (date, expected, ordered by or "Owner", store), supplier details, notes, items with picture, SKU, received / quantity, cost, received amount / amount, additional costs, Order Total, Total Received, Remaining; Approve Order | Same |
| Create / Edit form: supplier, order date, expected date, note; items found with the product search (not-for-sale products too), with In Stock, quantity, purchase cost (default: the product's purchase cost), amount; "SKU already exists"; additional costs; saved as draft, edit keeps the status; removing an item while editing marks it `to_delete` | Same, with the web's checks in order (supplier, items, quantity per item, amount per additional cost) |
| Receive sheet: pending / partial / completed counts; Full, Partial (half, at least 1) and Custom modes; one slot and one expiry for all items; select all; sort by name; per item quantity (not above what is left), slot, lot, expiry; "Receive N Item(s)"; "Cancel Remaining Items" completes the order with the rest cancelled | Same |

**Differences:** dates are typed as YYYY-MM-DD (no calendar). The supplier is chosen from chips (no search box). The web progress ring and the sort arrows are plain here.

**Offline:** the list and details are read from the saved copy; saving, approving, receiving and deleting need the server.

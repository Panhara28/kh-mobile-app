# Restaurant ordering: web vs phone

Restored from git (the version before the scope cut, commit `0bd7bf4^`) because a restaurant role has almost nothing else: the `ban` account on the local server is role **Service** with only `order`, `order-preparation` and `restaurant`. **The phone screens have not been opened on a phone.** This time I did not re-read every web restaurant file line by line; the code is the earlier, already compared version, re-checked here only by a feature list and the type checker and tests (465 pass).

Phone: `app/tables.tsx` (the table list), `app/table/[id].tsx` (a table's order), `ui/menu-browser.tsx`, `ui/cart-drawer.tsx`, `ui/product-sheet.tsx`, `ui/customize-line.tsx`, `ui/checkout-sheet.tsx`, `ui/cart-discount-sheet.tsx`, `ui/order-type-sheet.tsx`, `ui/transfer-sheet.tsx`, `app/table-setup.tsx`, `app/table-layout.tsx`, `lib/cart-discount.ts`, `lib/customers.ts`, `lib/table-form.ts`, `lib/table-layout.ts`. The app opens on the tables for a role that has `restaurant` and no dashboard.

| Web (`/admin/restaurant`) | Phone |
|---|---|
| Tables list; active tables in the sidebar | Tables screen; open a table |
| Menu with categories and search, add items, options, notes, quantity | Menu browser and product sheet; works from the saved menu offline |
| Cart: prepare / serve per item (pending, cooking, served), delete, Mark as Served | Table order screen with the same statuses (needs `order-preparation`) |
| Discount (item and cart), order type (dine in, take away, delivery with customer and extra price), guests, transfer to another table | Same sheets |
| Checkout: payment methods, receipt, shift required ("Please open shift before checkout") | Same; offline checkout is sent later |
| Table setup: add / edit / delete / generate tables; floor plan | `Table setup` and `Table layout` under More > Setup (need `table`) |
| Orders list: New Order, Open (a draft at its table), Undo returns to the table | Back in Orders for roles that have `restaurant` |

**Not on the phone (known gaps):**
- **Promotion sets** (the "Promotions" cards on the web menu: a combo is added in one tap, with a picker when a slot has several choices). The phone adds normal items only, so combos can't be sold from the phone. Discounts and the order-level rules the server applies still show in totals.
- Table QR codes and the invoice QR, "Open second window", the animated add-to-cart.
- Retail POS (`pos`) is still removed.

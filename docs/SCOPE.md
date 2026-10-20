# What the phone app contains

The phone app has the kh-pos admin web modules except **Cinema** (decided by the user). Some were removed in a scope cut and later restored; see the end of this file.

**Kept:** Dashboard and the other Reports; Inventory (Products with import and stock in / out / count, Category, Discount, Modifier, Production, Warehouse (Branches) with Slots, Slot, Transactions, Product Group); Restaurant ordering (the table list, a table's order with the menu, cart, kitchen status, checkout and transfer; Table setup and layout) for roles that have `restaurant`; Order Management (Customer Order and its details, Finding and Transfer, Order Return, Backlog, Shift); Supply (Suppliers, Supplier Product Price, Purchase Order, Replenishment with its suggestions); the profile menu (account, change password, device name, print and device settings, Settings).

**Removed** (still in git history, before the commit "Keep only the admin web modules"): retail ordering, Customers, the Roles list (roles are in Settings > Accessibility now), Board member dashboard, Promotion sets, and the whole Cinema and Accounting side (showtimes, halls, tickets, ticket sale, pricing templates, settlement, booking, chart of accounts).

The login, the saved copy of lists for offline reading and the saved-login for offline sign-in stay.

**Added back later:** restaurant ordering and Table setup / layout (a Service role such as `ban`, which has only `order`, `order-preparation` and `restaurant`, had almost nothing without them), Users and Payment Method (inside Settings).

**Restored later (round 2, from git before the scope cut, not re-compared line by line with the web):** Retail POS (`pos`), Accounting (Booking, Chart of accounts, shown only when the branch Accounting setting is on), Promotion Sets management (a tab on Discount), and the Board Member dashboard and sale report. They were compared with the web when first built; this time they were restored and checked by the type checker, the tests (514 pass) and the translation check only.

**Still not on the phone:** all of Cinema (showtimes, halls and seats, pricing template, tickets, find ticket, settlement, manual ticket, ticket sale, and the Print Socket-only parts that need a cinema), the invoice template live preview, and Type POS "Clean up dummy data" (it deletes data on the server). There is no general Customers page in the web either (only Delivery), so none was restored.

Which modules save while offline and send later: see [OFFLINE.md](OFFLINE.md).

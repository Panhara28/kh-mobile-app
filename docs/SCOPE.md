# What the phone app contains

The phone app now has only what the kh-pos admin web sidebar and profile menu have, as far as they were compared with the web (see HISTORY.md and each module's doc).

**Kept:** Dashboard and the other Reports; Inventory (Products with import and stock in / out / count, Category, Discount, Modifier, Production, Warehouse (Branches) with Slots, Slot, Transactions, Product Group); Restaurant ordering (the table list, a table's order with the menu, cart, kitchen status, checkout and transfer; Table setup and layout) for roles that have `restaurant`; Order Management (Customer Order and its details, Finding and Transfer, Order Return, Backlog, Shift); Supply (Suppliers, Supplier Product Price, Purchase Order, Replenishment with its suggestions); the profile menu (account, change password, device name, print and device settings, Settings).

**Removed** (still in git history, before the commit "Keep only the admin web modules"): retail ordering, Customers, the Roles list (roles are in Settings > Accessibility now), Board member dashboard, Promotion sets, and the whole Cinema and Accounting side (showtimes, halls, tickets, ticket sale, pricing templates, settlement, booking, chart of accounts).

The login, the saved copy of lists for offline reading and the saved-login for offline sign-in stay.

**Added back later:** restaurant ordering and Table setup / layout (a Service role such as `ban`, which has only `order`, `order-preparation` and `restaurant`, had almost nothing without them), Users and Payment Method (inside Settings).

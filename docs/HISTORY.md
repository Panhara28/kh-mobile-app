# History

What was done in this project, newest work last. For the reasons behind the design see [DECISIONS.md](DECISIONS.md). Nothing here has been tried on a real phone unless it says so: the checks were the typecheck, the unit tests, and building the Android bundle.

## Commits

The work below is saved in git (nothing has been pushed). A commit can't contain its own ID, so the IDs are recorded here in a following commit.

| Repo | Branch | Commit | What |
|---|---|---|---|
| `kh-pos-mobile` (this app) | `feat/offline-mode` | `d815a45afb2372893c3d5441fba79c69384364f7` (`d815a45`) | Offline mode, offline login, resend note and the fixes 11 to 17.1, docs |
| `kh-pos` (the API, `C:\dev\kh-pos`) | `feat/resend-log` | `8e7d021b04ef57f98b3cf40f71391ef6f0ccba28` (`8e7d021`) | `print_resend_log` table, migration and loaders for the resend note |

- The mobile branch was made from `master` (last earlier commit `30bee4a`); the kh-pos branch was made from `fix/customer-security` (last earlier commit `1368b6a`), so it also carries that branch's earlier history.
- The commit also contains the `eslint.config.js` and the `eslint` dev dependencies that `expo lint` created on its first run.
- To get back to exactly this work: `git checkout d815a45` in `kh-pos-mobile`, and `git checkout 8e7d021` in `kh-pos`.

## Setup used during this work

- **kh-pos API** (`C:\dev\kh-pos`): `npx next dev -p 3001 --turbopack`. Its database is the local MySQL `mood-pos` on `127.0.0.1:3307`.
- **Mobile app** (`C:\dev\kh-pos-mobile`): `npx expo start --clear` in your own terminal, then scan the QR code in Expo Go (or Enter URL manually: `exp://<PC address>:8081`).
- **Server address:** `EXPO_PUBLIC_KHPOS_URL` in `.env.local` must be the PC's current LAN address (it changed from `.105` to `.101` to `.102`). Expo only reads it at start, so restart Expo after changing it. Reserving a fixed IP for the PC in the router avoids this.
- **Low memory:** the system once stopped the kh-pos dev server on its own. It was only restarted when asked.

## 2026-10-18 to 19: fixes from the test list

| # | What | Where |
|---|---|---|
| 11 | Status rows in Customize Your Order show the full date, `ban · 2026-10-18 16:26`, like the web (before: time only for today). | `lib/time.ts` (`clockWithDate`), `ui/time-label.ts` |
| 12 | **Serve** in the Preparing row asks "Mark as Served": a quantity stepper (1 up to the preparing count, starts at the full count), Mark as Served / Cancel. Serves only that many. | `ui/customize-line.tsx` |
| 13 | Preparing and Served can still be edited, but not above the line's ordered quantity (stepper stops, typed values are refused with a message). Applied on the phone only; the server and web still accept more. | `ui/customize-line.tsx` (`maxFor`) |
| 14 | Order Summary shows an orange "Sent to kitchen 17 min ago" (hours too, never negative, refreshes every 30 s) instead of the clock time. | `ui/cart-drawer.tsx` |
| 15 | **Resend to Kitchen** in the item's ⋯ menu (items already sent), confirmed before sending. | `ui/cart-drawer.tsx`, `lib/api.ts` (`resendToKitchen`) |
| 16 | Resend asks **how many** (1 up to the number already sent, never more). | `ui/cart-drawer.tsx` |
| 17 | A note records every resend: who sent it and how many, e.g. "Resent 3 time(s): a ×1, b ×2, a ×1". Shown **only in Customize Your Order**, inside the Preparing box, not in the Order Summary (17.1). | `ui/customize-line.tsx`, `lib/line.ts` (`resendSummary`) |

**Server changes in kh-pos for 15 to 17** (a first version read the sender from the printed ticket text, which only exists once something has printed, so nothing showed without a printer; replaced by a real log):
- New table **`print_resend_log`** (order, order line, qty, resent by id and name, time). Migration `src/lib/db/migrations/20261019100000_create_print_resend_log.ts` (skips creation if the table exists), type `src/generated/tables/table_print_resend_log.ts`.
- **The table was created directly in the local `mood-pos` database** (only that table), after you confirmed. Run `npm run migrate` on any other database.
- `src/classes/print-to-kitchen.ts`: every resend writes a row. `src/dataloader/kitchen-log-loader.ts`, `order-detail-loader.ts`, `loader-factory.ts`, `src/classes/order.ts`: order lines now return `kitchenResends` (kept apart from `kitchenLogs`, so the web's "sent to kitchen" timing is unaffected).
- Resends made before this change were not recorded and don't show.

## 2026-10-19: working without the server

Goal: take orders with no connection to the KH POS server and send everything when it is back. Full reasoning in [DECISIONS.md, "Offline"](DECISIONS.md).

**Approach.** Not a copy of the kh-pos database (kh-pos has no sync API, and a sync library would end Expo Go). The phone keeps a **read cache** and an **outbox of changes**; kh-pos stays the only source of truth. No kh-pos change was needed for this part.

**Built** (all in `src/lib/offline/` unless noted):
1. **Local database**: `expo-sqlite` (the one new native-style dependency, bundled in Expo Go), tables `cache` and `outbox`, versioned migrations (`sqlite-store.ts`), memory fallback if it can't open (`store.ts`, and the sync sheet says which is in use).
2. **Reachability** (`api.ping`, `engine.ts`): asks the KH POS server itself, so a network with no internet but with the server counts as online. Checks every 8 s while offline or while changes wait, and when the app returns to the foreground.
3. **Read cache** (`data.ts`): tables, the whole menu (saved page by page, searched and filtered locally offline), categories, settings, dish promotions. Shows a banner with the time of the saved copy.
4. **Outbox and sync engine** (`engine.ts`, `types.ts`): each change is done at once when the server is reachable and nothing is waiting, otherwise kept and replayed in order later. Replay is safe to repeat (stable line ids, checks the table first, lost answers don't double-add or double-move). A network failure keeps everything; a refusal by kh-pos marks that change **failed** with its message; an expired login keeps everything.
5. **On-screen copy** (`overlay.ts`): the table with the waiting changes applied, new items marked "Not sent yet". Money is an estimate.
6. **Screens**: Online/Offline pill and sync sheet (`ui/sync-status.tsx`: waiting and failed changes, Retry, Discard, Sync now, what is saved on the phone); tables and table screens read through the cache; menu browser works from the saved menu.
7. **Opens offline** from the staff profile saved at login (`lib/session.tsx`), without waiting for a long timeout.
8. **Offline login** (`lib/offline-login.ts`, `secure-vault.ts`, `session.tsx`): after a login with a connection, the phone keeps for that person a salted PBKDF2 hash of the password (20,000 rounds, `@noble/hashes`) and their token in secure storage, plus their profile. With the server unreachable, a password typed on that phone is checked against it. Five wrong tries pause logins for a minute. Logging out keeps it. **The user table is not copied to phones**: kh-pos keeps bcrypt hashes and permanent tokens, and copying them to every phone would expose everyone if one phone were lost.
9. **Everything in Customize Your Order works offline**, including items made offline: Prepare and Serve, serve everything, count edits, options, note and its charge, manual discount, promotions, resend, delete. Only checkout and table transfers are not offline (the app has neither).
10. **Logout warning** when offline or when changes are still waiting.

**Dependencies added:** `expo-sqlite`, `@noble/hashes`. Changed: `package.json`, `app.json` (sqlite plugin), `pnpm-lock.yaml`.

**Checks at the end:** `tsc` clean; 116 tests in 14 suites pass (fake kh-pos server that can go offline or lose an answer, cache, outbox, overlay, offline login, all Customize actions); Android bundle builds. `expo lint` still reports the errors that were already in older code (`set-state-in-effect`, refs during render in `session.tsx`, `cart-drawer.tsx`, `customize-line.tsx` and others); nothing new in the new files.

## 2026-10-19 to 20: the web app's modules, on the phone (branch `feat/full-parity`)

Goal: every part of the kh-pos web app reachable from the phone. The **More** tab lists the modules the signed-in role may read (same permission names as the web menu; `lib/modules.ts`). Each module has its logic in `src/lib/<name>.ts` with tests, a screen in `src/app/`, and English and Khmer text.

| Module | Commit | What it does |
|---|---|---|
| Shifts, checkout, receipts, More hub | `0b6025d` | Open and close a shift, pay with several methods and currencies (also queued offline), receipt share and print |
| Orders | `a9d6ff3` | List, detail, returns, reverse to draft, delete |
| Table transfer, table setup | `316b930` | Move an order, add, edit, delete and generate tables |
| Reports | `06f3f5c` | Dashboard, end of day, sales, categories, items, voids, guests, stock, expiry |
| Admin lists | `0e0ac9d` | Categories, modifiers, discounts, payment methods, suppliers |
| Products | `f904df0` | Search, filter, add, edit with pictures and variants, delete |
| Users, branches, slots, account | `708b947` | Includes password reset |
| Settings, stock movements, returns, backlog | `b7cc24a` | |
| Cart discount | `9bc3aca` | Also offline |
| Order type | `58abd8f` | Dine in, take away, delivery with customers |
| Purchase orders | `2e3a292` | Draft, approve, receive into slots, delete |
| Replenishment | `29e5726` | Send stock to another branch, approve, receive |
| Stock counting | `40886aa` | Count a slot, stock in, stock out, move between slots |
| Promotion sets | `7a18346`, `e34f1dd` | Combos with dates, happy hours and items |
| Roles and access | `16410cf` | Permission editor per area |
| Retail POS | `3aae266` | Search or scan barcodes, cart, charge (adds `expo-camera`) |
| Production | `b3501ff` | Check a recipe against stock, make the product |
| Board-member dashboard | `da32b67` | Sales by branch and integrated brand |
| Accounting | `ff48017` | Chart of accounts and bookings |
| Cinema showtimes | `d9b22d5` | Day view, add, edit, delete |
| Cinema tickets | `3558823` | Reservations by day and status, admit by button or by scanning the code |
| Cinema pricing | `f1977f1` | Pricing templates |
| Cinema settlement | `36d3097` | Generate, details, settle with a photo as proof |
| Table floor plan | `c2fa4ef` | Drag tables into place and save positions |
| Cinema ticket sale | `affdec7` | Pick a showtime, tap seats on the hall map, charge |
| Cinema halls | `1f1453c` | Size the room and paint the seats |
| Accounting gating | `026d094` | Shown when the branch turns Accounting on; any signed-in staff |
| Board drill-down | `ca8837f` | Open a branch (or integrated brand) for its sales by category and item |
| Replenishment suggestion | `778a8d0` | Fills the lines with what the receiving branch is low on |
| Digital tickets | `23fb3c5` | Find a ticket by code or phone number, admit |
| Manual ticket upload | `00ec928` | Record tickets sold outside the system per movie, hall, day and show time |
| Replenishment picking list | `4ad7d40` | Shows slot and lot per item; the sender checks lots by tapping or typing the lot number |
| Permissions | `f0d5cb2` | A resource missing from the role means no access (as the web middleware does); view-only counts as read |
| Product groups | `ecd4232` | Name, branches and products of a group; add, edit, delete |
| Products, 100% of the web module | `029e7a4` | The full Add/Edit form and the full Product page; see [PRODUCTS.md](PRODUCTS.md) |
| Categories, 100% of the web module | `5ec5930` | Picture upload, products for sale count, printer, sort, delivery fee, For Sale enable/disable, branch rules; see [CATEGORIES.md](CATEGORIES.md) |
| Modifiers, 100% of the web module | `5a1b6f8` | Option rows with prices, totals, Applies to Products; works around a kh-pos update bug; see [MODIFIERS.md](MODIFIERS.md) |
| Discounts, 100% of the web module | `770bb25` | Campaign list with Applies On, form, and the Applies sheet (all / products and variants / categories); see [DISCOUNTS.md](DISCOUNTS.md) |
| Payment methods, 100% of the web module | `1c135b6` | Numbered list with created date, add, rename, delete with the web wording; see [PAYMENT-METHODS.md](PAYMENT-METHODS.md) |
| Suppliers and supplier product prices, 100% of the web modules | `954dd00` | Numbered supplier list with the web fields, add/edit/delete with the web wording; new Supplier product price screen (filters, order, add, edit, scheduled price, delete); see [SUPPLIERS.md](SUPPLIERS.md) |
| Production, 100% of the web module | `8d7544c` | Recent production list, Add Products sheet with composed-product search, plan, stock summary, lot verification; see [PRODUCTION.md](PRODUCTION.md) |
| Warehouse (Branches), 100% of the web module | `7e893a4` | Card list with image/Main/created date, full form with picture, location and manager login; fixed branch list address (/api/warehouse); see [WAREHOUSES.md](WAREHOUSES.md) |
| Slot, 100% of the web module | `7a9e591` | Own menu item for the current branch, searchable paged list with (POS), add/edit/delete; see [SLOTS.md](SLOTS.md) |
| Transactions, 100% of the web page | `2575cee` | 17 filters, server paging, product image, slot + branch, date, quantity and amount; see [TRANSACTIONS.md](TRANSACTIONS.md) |
| Product group, 100% of the web module | `f9b6b3e` | Branch filter, paging, badges, delete from list, and the visibility calls the web makes on save/delete; see [PRODUCT-GROUPS.md](PRODUCT-GROUPS.md) |
| Customer Order, 100% of the web page | `7c74d5e` | Whole-period summary, phone/ticket search, My Shift, row actions; all server answers now stripped of other users' tokens; see [ORDERS.md](ORDERS.md) |
| Finding and Transfer, new screen | `9fa084c` | Draft order list, picking list, transfer to POS slot and unit conversion like the web; see [STOCK-FINDING.md](STOCK-FINDING.md) |
| Order Return, 100% of the web page | `e7c8920` | Returned / Stock In tabs, RTN codes, history, Stock info sheet, Return Stock; permission fixed to return; see [RETURNS.md](RETURNS.md) |
| Backlog, 100% of the web page | `17b4846` | Server order and paging, BL codes, SKU, branch, current slot stock, Resolve messages; see [BACKLOG.md](BACKLOG.md) |
| Shift, 100% of the web page | `b789fad` | Shift management list, details, discrepancy warning, handover receipt print/share; see [SHIFT.md](SHIFT.md) |
| Purchase Order, 100% of the web page | `6a4c884` | Full row columns and menu, edit, details, create/edit form with stock and checks, receive sheet with modes and cancel remaining; see [PURCHASE-ORDERS.md](PURCHASE-ORDERS.md) |
| Replenishment, 100% of the web pages | `fece422` | TR codes, main/other branch lists, edit/delete drafts, form with picking list and Check Stock, general information, lot-gated approve, suggestions page; see [REPLENISHMENT.md](REPLENISHMENT.md) |
| Reports (sale, breakdown, end of day, items, void, guests, stock, expiry) | `5c336ee` | Filters, chart, totals, export/print like the web; stock report now sends its dates; see [REPORTS.md](REPORTS.md) |
| Profile menu (account) | `75226d3` | Change password checklist, device name sent as X-Device headers, print and device settings, shift and settings links; see [PROFILE-MENU.md](PROFILE-MENU.md) |
| Reports: Sale Product and Cinema Sales | (this commit) | Product chart and cinema showtime sales with filters, export and email; see [REPORTS.md](REPORTS.md) |

**Offline, per module.** Ordering at tables (including checkout, shifts, discounts, order type) works offline and is sent later, as above. Every other module **reads** from the saved copy offline and **needs the server to save**: it says so instead of failing. Retail POS and cinema ticket sale need the server to charge, because the stock, the seats taken and the invoice number come from kh-pos.

**Not built, on purpose.**
- *Printer settings*: `/api/printer` prints from the kh-pos server's own Windows printers; a phone has nothing to configure. The phone prints receipts through the system print dialog.
- Picking list: the web lets staff pick which slots and lots to take; the phone shows the list and verifies lots but does not re-plan it.
- Accounting has no permission of its own in kh-pos: the web shows it whenever the branch's Accounting setting is on, to every admin. The phone does the same (`setting: 'ACCOUNTING'` in `lib/modules.ts`, and `OPEN_RESOURCES` in `lib/line.ts`).

**Checks.** `tsc` clean, 312 tests in 44 suites pass, Android bundle builds, lint clean on every new file. **Nothing in this section has been opened on a real phone or run against a live kh-pos.** The assumptions most likely to be wrong are listed in the README under "Try the new modules".

## Known limits

- **Not tried on a real phone.** Test with the checklist in the README ("Try offline mode on a phone"). Log in once **with the server running** (log out first if you were logged in before this version) so the phone saves the menu, tables and your login.
- Invoice number is assigned by kh-pos when an offline order is sent; the phone shows "Not sent yet".
- Quantity changes are absolute: an offline change overwrites someone else's change made meanwhile.
- Kitchen tickets print only after sync. A resend can print twice if its answer is lost.
- Product photos are not saved (initials show offline).
- A password changed on the server still works offline on a phone that hasn't seen the change; kh-pos tokens never expire (see the README notes).
- Promotions offline only for dishes whose list was loaded while online.
- The first login on a phone needs the server.

## Possible next steps

- Open every module on a phone against a real kh-pos and fix what it finds (checklist in the README).
- Try offline mode on two real phones (airplane mode on both, then back on) and fix what it finds.
- Run the app's ordering code against a real kh-pos with `pnpm e2e` (needs the staff password).
- Save product photos for offline use.
- Add an idempotency key to kh-pos resend so it can never print twice.
- Fix the older lint errors.

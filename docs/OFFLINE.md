# Offline: what is saved on the phone and sent later

**Not tried on real phones.** The queue is tested with a simulated server (`lib/offline/records.test.ts`, `engine.test.ts`): sent at once when online, kept and sent in order when back, kept as "Needs attention" when kh-pos refuses, an add that already got through counts as done.

## How it works

The phone keeps a queue (the "outbox") in its own database. While kh-pos can't be reached, a save is written to the queue and shown on the screen at once (marked "Not sent yet"). When kh-pos is back the queue is sent in order; the sync list (the Online/Offline pill) shows what waits, what failed and why, with Retry and Discard. **kh-pos wins**: the phone only sends the same request the web would have sent, and if kh-pos refuses it, the change stays in the sync list as failed and the screen keeps showing it marked "Not saved". Two phones changing the same record: the last one sent wins (kh-pos has no edit conflict check for these).

Other phones do not receive anything from this phone directly; they see the change after it reached kh-pos, the next time they load the screen.

## What is saved and sent later

| Module | Add | Edit | Delete | Notes |
|---|---|---|---|---|
| Table orders, kitchen status, discounts, shifts, checkout | yes | yes | yes | the first offline feature; see DECISIONS.md |
| Payment Method | yes | yes | yes | the id of a new method is made on the phone |
| Delivery customers | yes | yes | yes | kh-pos makes the id, so a new customer can't be edited until it is sent |
| Category | yes | yes | yes | same; branches that are not the main one still can't add or delete (as the web) |
| Modifier | yes | yes | yes | the id of a new modifier is made on the phone |
| Discount (campaigns) | yes | yes | yes | the id is made on the phone; "Applies on" still needs the server |
| Supplier | yes | yes | yes | kh-pos makes the id; a new supplier can't be edited until it is sent |
| Settings (General) | - | yes | - | each setting is one saved value; image uploads inside a setting still need the server |

## Stock and supply (round 2)

These move stock, so they follow one extra rule, **"send once"**: a change that would be done twice if sent twice is only sent when kh-pos answers a ping, never repeated by itself, and if the answer to the send is lost it is **not** queued (the error says to check kh-pos first). A queued one whose answer is lost on the replay is kept as failed ("could not confirm ... check there before doing it again") for the staff to check, then Retry or Discard. Nobody gets stock twice by accident.

| Where | What is saved offline | Rule |
|---|---|---|
| Stock counting (Products > a variant, or More) | Stock in, Stock out, Count, Move between slots | send once; the lots on screen are the saved copy, kh-pos checks the stock when it receives it (out of stock = failed with its message) |
| Purchase Order | Delete (list and details), Approve, Cancel remaining, **Receive** | Receive is send once; the order shows "waiting" and offers no second receive / edit / delete until sent. Approve shows as approved on the details at once |
| Replenishment | Delete, Approve (main branch), **Receive** (receiving branch), mark a picked lot, create from Suggestions | Receive, picked lot and Suggestions are send once; the details offer no second action while one waits |
| Backlog | Resolve | send once; the row leaves the list at once |

**Creating orders offline (round 3).** The product search of the Purchase Order, Replenishment and Production forms now works offline: while kh-pos can be reached the picker also saves every product it can find (title, SKU, barcode, stock, cost), and when kh-pos can't be reached it searches that saved copy and says so (stock and cost are as of the last time it was saved; the very first time needs a connection). With it:

| Where | Offline | Rule |
|---|---|---|
| Purchase Order | Create, and Edit | A new order is "send once" (kh-pos makes its id): it shows in the list as "Not sent yet", and can't be opened, edited, received or deleted until it has been sent. An edit is one PUT of the whole order (last write wins) and the order shows "waiting" until it is sent. The supplier list needs to have been opened online once |
| Replenishment | Create (not edit) | Sent once, **without a picking list** (the web also lets a saved order get its picking list when it is opened); the picking list is only worked out when someone opens the draft with kh-pos reachable. Shown as "Not sent yet" and not openable until sent. Editing a replenishment needs the server, because changing lines changes the picking list |

## The rest (round 4)

More changes are kept on the phone and sent later. A change with several calls (a product group: the group, its products, its branches ...) is sent call by call, and the phone remembers how many went through, so a retry carries on from the next call and never starts again. A reply that is a "yes or no" inside a successful answer (Returns "Put back in stock" answers `{result: false}` when it refuses) counts as a refusal. An add that clashes only with **its own id** ("Duplicate entry ... PRIMARY") is taken as already done; any other duplicate (the same barcode, for example) is a real conflict and shows as failed.

| Where | Offline | Rule |
|---|---|---|
| Product groups | Add, edit, delete | all the calls in one queued change; the group's id is made on the phone, so a new group can be edited at once |
| Slots | Add, edit, delete | kh-pos makes the id of a new slot, so it can't be edited until sent |
| Supplier prices | Change a price, delete; **add** is sent once | a changed price shows at once; a new price appears after it has been sent |
| Returns | Put back in stock | send once; kh-pos refusing it shows as failed |
| Products (the full product form) | Add, edit | one call with ids made on the phone; pictures must already be uploaded; a new product shows in the product list after it has been sent |
| Branches | Add (sealed account password), edit, delete | add and delete are sent once; the branch account's password is sealed on the phone |
| Users | Add (sealed password), edit, delete, reset password | the password is sealed on the phone; changing the branches a person is bound to is sent once, and only when that list was loaded online |
| Roles (Accessibility) | Change a role's permissions; a new role is sent once | the role shows its new permissions at once |

## Production offline (round 5)

Offline you pick a product (from the saved product search), a quantity and the slot for the new stock, and Produce is kept on the phone. **The parts are not decided on the phone.** When the change is sent, kh-pos is asked for the plan (which parts, and from which slots and lots) with the stock it has *then*, and only if every part is available is the production made; otherwise the change is kept as failed with the reason ("Not enough stock to produce 5: Flour") and nothing is made. It uses up parts and makes stock, so it is send once (a lost answer is never repeated by itself). With "restrict product lot" on, production still needs a connection. The product search needs to have been opened online once.

## Retail POS and table transfer offline (round 6)

| Where | Offline | Rule |
|---|---|---|
| Retail POS | Search, scan, cart, Charge and pay | The products are the copy saved the last time Retail was opened online (all products, by name or barcode). The paid sale is kept on the phone with a receipt marked offline (no invoice number yet). When kh-pos is reached the phone checks the stock in the POS slot, asks for the invoice number, opens the order **with the order id made on the phone** and pays it. A lost answer never sells twice: an order that is already paid is done, one that is open is only paid. If a product is not in the POS slot the sale is kept as failed ("Move the stock to the POS slot, then Retry"). **Needs a kh-pos with the `orderId` change (branch `feat/mobile-offline-support`)**; an older kh-pos ignores the id and a retry after a lost answer could open a second order |
| Table transfer | The **whole order** to a table the saved list shows as free | Only for a table with nothing waiting to be sent. The order shows on the other table at once. When sent, kh-pos' own order and tables are read again: an order already on the destination is done; a destination that has an order now, or an order that left the table, is kept as failed with the reason (nothing is merged or split by surprise). Moving part of an order, or onto a table with an order, still needs the server |

## Orders and Stock finding offline (round 7)

- **Orders:** every list read online is also added to a set of the last 300 orders kept on the phone, and the details of the first 20 are saved. Offline, any date range, status, invoice number or phone can be answered from that set (a shift or a cinema ticket code cannot, so those filters are not applied) and the summary cards cover only those saved orders. An order older than the saved set, or whose details were never opened or prefetched, needs the server. Undo, delete, return and print count still need the server.
- **Stock finding and transfer:** the picking lists of the first 15 draft orders are saved when the list is read online. Offline, a list opens from that copy and "Transfer all" / "Convert" are kept and sent once when the server is back (a move that is waiting is not offered again).

## Background sync of every module (round 8)

Nothing has to be opened first any more. While kh-pos can be reached the phone reads, in the background and one request after another, the first screen of every module (`lib/offline/warm-modules.ts`): Products, Categories, Suppliers, Branches, Discounts, Modifiers, Promotion sets, Users, Chart of accounts, Delivery customers, Purchase orders, Replenishment, Returns, Backlog, Stock movements, Production history, Supplier prices, Product groups, Slots, Shifts, Orders (today and the latest), Stock finding drafts, Booking (this month), Printers, Roles, the Retail POS catalog (all products), the Board dashboard, the details of the first 15 products (with their variants' movements and supplier prices), purchase orders and replenishments, the sheets of the first 30 discounts (applies on), modifiers (products) and users (branches), and the reports below. Pickers and sheets read through `KhPosApi.getOrSaved`: offline they use the saved copy of that address, and a product search by title or barcode is worked out from the saved catalog. Four requests run at a time (about a third of the time of one by one). Progress shows in the sync sheet ("Modules saved for offline: saving 142 of 250", then "All modules saved" with the time) and as "Online · saving 40%" on the pill. It runs when the app starts, when kh-pos is back, when the app returns to the foreground and every 10 minutes. A module the staff member may not open (403) is skipped.

How a screen uses it: every GET answer is kept on the phone by its address (`KhPosApi.setUrlCache`, up to 8 MB each). When kh-pos can't be reached a screen is first rebuilt from those saved answers (`KhPosApi.fromSavedCopies`, shown with the "saved copy" banner and the age of the oldest answer used), and only if that is not possible from the copy saved by the screen itself. So a module opened with the same first screen, or one that was ever read with the same filters, shows data offline.

**Limits:** only the first pages are synced (three of 30 for most lists), so scrolling further, other filters, searches, and the details of one record (a product, a purchase order) show offline only if they were read before. Reports are synced for today, yesterday, the last 7 days and the last 30 days (Dashboard, Sale report and breakdown, End of day, Sold items, Void orders, Guests, Stock, Expiry, Sale product) with the branch's own data and no extra filters; a custom date range or a filter shows offline only if it was read before. The Orders list keeps its own set of recent orders. The first sync needs the phone to stay online for a minute or two after login.

## Everything is written to SQLite first (round 9)

Every change the app makes (not Cinema, which is not on the phone) goes through one door, `SyncEngine.run` / `runOnce` (and `useRecordWriter` for the setup screens): it is **written to the phone's SQLite database first** with the status `sending`, then sent at once when kh-pos can be reached and removed when kh-pos has answered. If the signal is lost mid-send it becomes `pending` and is replayed in order; if kh-pos refuses it, the reason is shown and it is not kept.

- **A crash or the app being closed mid-send:** at the next launch a change left `sending` is looked at (`recoverSending`). A change that can safely be sent again (table, shift, checkout, retail sale, transfer, an edit or delete) goes back to waiting. One that would be done twice if it had got through (a new record whose id kh-pos makes, stock moves, returns, undo, bookings, production, imports) is kept as **failed: "The app was closed while this was being sent. Check in KH POS ..."** for the staff to Retry or Discard. A `once` change whose answer is lost while online is kept the same way ("Could not confirm ...").
- **Passwords are sealed:** a change that carries a password (add user, reset password, change your own password, add a branch with its account, the user Excel upload) is stored as `enc1:...`: XChaCha20-Poly1305 with a random 256-bit key held in the phone's secure storage (Android Keystore / iOS Keychain), never in the SQLite file (`secret.ts`, `phone-secret.ts`). If the secure storage is reset the sealed change cannot be read and is shown as failed ("can no longer be read ... do it again"). The offline sign-in on the phone still uses the verifier saved at the last online login, so a password changed while offline works offline only after it has been sent and the person has logged in online once.
- **Pictures:** a picture picked for a category, product, branch, user or setting is kept as a data address inside the change, and uploaded just before the change is sent (`uploads.ts`); one already uploaded by an earlier try is not uploaded again (remembered by a hash).
- **Excel imports** are read on the phone; the rows are the change.
- **A later call can use an earlier answer:** a replenishment is created and then its picking list is set with the id kh-pos answered (`{{result}}` in the later call; the id is kept so a retry carries on).
- **Table transfers:** the whole order to a free table shows on the other table at once; part of an order or a table that has an order is kept as it is (no on-screen change) and kh-pos checks it when it is sent.
- **Retail sale:** online and offline use the same sale command (the order is opened and paid in one go, nothing is left open if the cashier backs out).

### What still needs the server

- **Logging in on a phone for the first time** (and a password the phone has not seen).
- **Clean up dummy data (Type POS):** it deletes server data with a live progress stream; it is deliberately not queued.
- **Production with "restrict product lot" on:** the lots to scan come from kh-pos.
- **A picking list for a replenishment** (and the stock figures behind it) is worked out by kh-pos, so an order saved offline gets it when it is opened with kh-pos reachable.
- **Reading** a record that was never read before (details of an old product, an old order): the background sync keeps the first screens and the first records of the main lists.
- **Printing to the print server** needs the printer PC on the same network, not the internet, so it works offline; it is not a kh-pos change.

## Limits worth knowing

- A queued edit is made on the copy the phone saved last, then sent as a whole record (the web does the same): if someone else edited other fields meanwhile, this phone's version replaces them.
- An add that is sent twice because the answer was lost can create a duplicate for modules where kh-pos makes the id (Category, Delivery, Supplier).
- Stock figures on screen are the copy saved earlier; a stock out larger than what the saved copy shows is refused on the phone, and one that kh-pos refuses later shows as failed in the sync list.
- Logging out keeps the queue on the phone; it is sent after the next login of the same person.

## Automated phone tests

`e2e/` has Maestro flows that run on a phone over USB (see `e2e/README.md`): login, the background sync (fails if anything "could not be saved"), and every module opened offline (fails on the network error). On 2026-10-21 all three passed on an OPPO A16 in Expo Go with 36 modules (Bookings and Chart of accounts are hidden for the test account).

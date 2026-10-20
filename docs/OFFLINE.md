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

Still not offline: Production (the parts to use are worked out by kh-pos), Returns "Put back in stock" (kh-pos answers yes or no), Product groups and Supplier prices (several calls in a row), Slots, the full Product form.


## What still needs the server

- **Users, bind users, passwords, roles:** a password must not sit in the phone's queue, and these change who may log in.
- **Branches (warehouses):** the form holds a password for the branch account.
- **Product groups, Supplier prices, Products and stock (in/out/count), Slots, Purchase orders, Replenishment, Returns, Production, Backlog:** several calls in a row or stock and money that other phones change at the same time. They read their last saved copy offline and say a change needs a connection.
- **Retail POS charging, invoice numbers, uploads (pictures, Excel), reports, printing to the print server:** the answer comes from kh-pos or the PC.
- **Offline login** only works for staff who logged in on that phone before.

## Limits worth knowing

- A queued edit is made on the copy the phone saved last, then sent as a whole record (the web does the same): if someone else edited other fields meanwhile, this phone's version replaces them.
- An add that is sent twice because the answer was lost can create a duplicate for modules where kh-pos makes the id (Category, Delivery, Supplier).
- Stock figures on screen are the copy saved earlier; a stock out larger than what the saved copy shows is refused on the phone, and one that kh-pos refuses later shows as failed in the sync list.
- Logging out keeps the queue on the phone; it is sent after the next login of the same person.

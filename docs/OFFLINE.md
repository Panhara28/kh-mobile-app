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

## What still needs the server

- **Users, bind users, passwords, roles:** a password must not sit in the phone's queue, and these change who may log in.
- **Branches (warehouses):** the form holds a password for the branch account.
- **Product groups, Supplier prices, Products and stock (in/out/count), Slots, Purchase orders, Replenishment, Returns, Production, Backlog:** several calls in a row or stock and money that other phones change at the same time. They read their last saved copy offline and say a change needs a connection.
- **Retail POS charging, invoice numbers, uploads (pictures, Excel), reports, printing to the print server:** the answer comes from kh-pos or the PC.
- **Offline login** only works for staff who logged in on that phone before.

## Limits worth knowing

- A queued edit is made on the copy the phone saved last, then sent as a whole record (the web does the same): if someone else edited other fields meanwhile, this phone's version replaces them.
- An add that is sent twice because the answer was lost can create a duplicate for modules where kh-pos makes the id (Category, Delivery, Supplier).
- Logging out keeps the queue on the phone; it is sent after the next login of the same person.

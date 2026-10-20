# KH POS staff app

Staff mobile app for [kh-pos](https://github.com/sokphaladam/kh-pos), working like the kh-pos web restaurant POS:

1. **Log in** with a kh-pos username and password.
2. **Tables:** the branch's tables, each with its status, open order total and items not yet sent.
3. **Tap a table** to see the menu. **Tapping a dish adds it to the cart at once.** Tapping again adds more, and each card shows how many are in the cart. **Hold a dish** to choose options and add a note.
4. **The 🛒 cart button** (with a count) opens a drawer from the right with the table's order: each line with its kitchen status (not sent, cooking, served). Staff can change or remove items that haven't been sent, then **Send to kitchen**.
5. **Tap an item in the cart** to open **Customize Your Order**, the same screen as the web POS:
   - **Quantity Management:** Prepare, Serve, and editing the pending, preparing and served counts. Editing preparing or served counts needs the role's order-preparation update and delete permissions, as on the web.
   - **Options**, **Special Instructions** (with an optional extra charge), **Manual Discount** and **Promotions**. kh-pos queues the kitchen tickets for the kitchen printer itself.

**More tab:** the rest of the web app, for the staff whose role allows it: shifts and checkout, orders and returns, reports, products and categories, stock (purchase orders, replenishment, counting, production, movements), retail POS with barcode scanning, promotion sets, discounts, users and roles, accounting, and the cinema (showtimes, tickets and door scan, ticket sale with the seat map, halls, pricing, settlement), plus the table floor plan. What was built, with commit ids, is in [docs/HISTORY.md](docs/HISTORY.md).

Built with Expo SDK 57, Expo Router and TypeScript. It runs in **Expo Go** during development. See [docs/DECISIONS.md](docs/DECISIONS.md) for the choices behind it and [docs/HISTORY.md](docs/HISTORY.md) for what has been done so far.

## Works without the server

The app keeps working when the KH POS server can't be reached (no internet, server restarting). It checks the server itself, so a shop network with no internet but with the server on the same Wi-Fi counts as online.

- **Opens offline** from the staff profile saved on the phone, and **logs in offline** for anyone who has logged in on that phone before with a connection (the password is checked against a salted hash kept on the phone; the first login on a phone needs the server). See "Offline login" in [docs/DECISIONS.md](docs/DECISIONS.md).
- **Browsing:** tables, the menu, categories and settings come from a copy saved on the phone. A banner shows when the copy was taken.
- **Ordering:** everything works: adding dishes, quantities, Prepare and Serve, options, notes, discounts, promotions, guests, Send to kitchen and resend, in the cart and in Customize Your Order. Changes are saved on the phone and shown on screen straight away (new items are marked "Not sent yet"), then sent to KH POS in order as soon as it can be reached. The kitchen gets its ticket only then, and the app says so.
- **Not offline:** table transfers, and every module outside table ordering can be read offline but needs the server to save. Promotions can only be applied offline for dishes whose promotions were loaded while online.
- **Status pill** (next to the logout button and in a table's header): Online / Offline, how many changes are waiting, how many failed. Tap it for the list, **Sync now**, and Retry / Discard for anything KH POS refused.
- **Conflicts:** KH POS always wins. A change KH POS refuses (the item was removed, the table was closed) is kept as "failed" with KH POS's message, never lost silently.

How it works is in [docs/DECISIONS.md](docs/DECISIONS.md#offline-2026-10-19).

## Run it

You need a kh-pos server running (for local development, `npx next dev -p 3001` in the kh-pos folder) and Node 22+ with pnpm.

```bash
pnpm install
cp .env.example .env.local      # set EXPO_PUBLIC_KHPOS_URL to your PC's Wi-Fi address, e.g. http://192.168.0.105:3001
npx expo start --clear
```

Open **Expo Go** on an Android phone on the same Wi-Fi and scan the QR code shown in the terminal, from inside Expo Go.

## Test data

`scripts/seed-dev.mjs` creates a "Staff" role, a staff user and a small sample menu through the kh-pos admin API. It is safe to run more than once. **Use it on development servers only.**

```bash
KHPOS_URL=http://localhost:3001 ADMIN_USERNAME=admin ADMIN_PASSWORD=... STAFF_USERNAME=staff1 node scripts/seed-dev.mjs
```

It prints the staff username and password. If you don't set `STAFF_PASSWORD`, it generates one. It also creates two modifier groups ("Sugar level", "Add-ons") and tables "Table 1" to "Table 6".

## Try offline mode on a phone

1. Log in **with the server running** (log out first if you were already logged in, so the phone remembers your login), and open the tables (this saves the menu and tables).
2. Switch the phone to airplane mode, or stop the kh-pos server. The pill turns to **Offline** within a few seconds.
3. Open a table, add a few dishes (one with an option and a note), change a quantity, remove one, set guests and **Send to kitchen**. Tap an item in the cart to open **Customize Your Order** and try Prepare, Serve, options, a note, a discount. Everything shows on screen, and the pill counts the waiting changes.
4. Close the app completely and open it again offline: it still opens and the changes are still there. Then log out and log in again offline with the same password: it works (it takes a few seconds). Log in as a name this phone has never seen: it says to connect once.
5. Switch the network back on. Within about 10 seconds the pill goes to **Online**, the changes are sent, and the table shows the real invoice number. Check the same table on the web POS.
6. Try a conflict: offline, add a dish to a table; on the web POS close or change that table; go online. The change KH POS can't apply shows under **Needs attention** in the sync list.

## Real-phone checklist

**None of this has been opened on a real phone yet.** Everything below was checked by reading the web source, by tests, and by running the phone's logic against a local kh-pos, never on a device. Do this with the phone next to the web admin (same server and branch), as a role that has the module (the owner sees all), and note anything that differs in words, fields, order, numbers or behaviour. Each module has a doc in `docs/` listing what was compared and the known differences.

Setup: `.env.local` has `EXPO_PUBLIC_KHPOS_URL=http://<PC LAN address>:3001`; kh-pos must listen on the network (`next dev -H 0.0.0.0 -p 3001`) and the firewall must allow port 3001; the phone is on the same Wi-Fi; start Expo with `npx expo start -c`.

For every screen, also check: it opens, scrolls, and goes back; the keyboard does not hide the Save button; Khmer and English both read well (Profile > language); offline it shows the saved copy and says changes need the server.

| Area | Open | Compare with the web, and try |
|---|---|---|
| Login and home | log in as owner, then as a Service role | owner opens on the dashboard; a role with `restaurant` opens on the tables; More lists modules A to Z |
| Reports | each report in More > Reports | same totals as the web for the same dates; filters, export, email |
| Inventory | Products, Category, Discount (and its Promotion Sets tab), Modifier, Production, Branches and Slots, Stock movements, Product groups | list columns, add/edit/delete, stock in/out/count, Upload Excel (main branch) |
| Order management | Orders, Order details, Stock finding and transfer, Returns, Backlog, Shift | filters and search, receipt print, undo, open/close shift |
| Supply | Suppliers, Supplier prices, Purchase orders (receive: full, partial, custom), Replenishment (suggestions, approve) | codes, status changes, stock after receiving |
| Restaurant | Tables, a table's order, cart, kitchen status, discount, order type (delivery), transfer, checkout, QR button on a table, Promotions chip, Table setup and layout | the same order on the phone and the web POS at the same time; offline ordering then reconnect (see above); a promotion set adds the lines and the discount appears |
| Retail POS | Retail | barcode scan finds the product; an order with no table is accepted; charge and receipt |
| Clean up dummy data / invoice preview | Settings > General > Type POS (needs a test branch: it deletes test orders) and Invoice Receipt | the purge shows progress and finishes; the preview changes when you edit the template, title or paddings |
| Offline saves | airplane mode: edit a Category, a Supplier, a Setting, a Discount, a Modifier, a Payment Method; then turn the network on | the row shows "Not sent yet" and the sync list shows the waiting change; after reconnecting it shows no more mark and the web has the same values (see docs/OFFLINE.md) |
| Settings | Profile > Settings: General (every category, A to Z), Accessibility, Users (add, edit, bind branches, reset password, Upload Excel), Delivery, Payment Method | every editor saves the same text the web saves; the web shows the new value; Users Upload Excel gives new users the password 123456 |
| Accounting | Booking and Chart of accounts (only when the branch Accounting setting is on) | lists and entries match the web |
| Board member | sign in as a Board Member role | the board dashboard and sale report |
| Printing | Profile > Print & Device Settings | Scan fills the address from the print app's QR; Test says connected; with method "Print server" and a printer name, a receipt prints on that printer; General > Inventory and Print Socket "Print" send a sample |
| QR codes | Tables > QR; Settings > General > Product Menu Rules | the table QR opens that table's menu in a browser; the invoice QR opens the invoice; Copy and Share work |

Known gaps are listed in `docs/SCOPE.md` and each module's doc (Cinema is not on the phone; the phone's printed receipts use the phone's own layout, not the web templates; the Invoice Receipt preview needs the kh-pos branch with the `/invoice/preview` page).

## Checks

```bash
pnpm test          # API client, order logic, offline sync (outbox, replay, cache), menu and money helpers, translations
KHPOS_URL=http://localhost:3001 STAFF_PASSWORD=... pnpm e2e   # the app's ordering code against a real kh-pos (dev only; cleans up after itself)
pnpm typecheck
npx expo-doctor
```

## Notes

- kh-pos staff tokens never expire and are built from the phone number plus the creation time, so they can be guessed. This is an issue to fix in kh-pos before going live.
- When two phones open orders at the same moment, kh-pos can suggest the same invoice number to both (it doesn't reserve it). The app detects this and retries with a fresh number, or adds to the other phone's order on the same table. The kh-pos web POS doesn't do this.
- Product search matches parts of words: kh-pos uses MySQL full-text search. The web menu returns the same results.

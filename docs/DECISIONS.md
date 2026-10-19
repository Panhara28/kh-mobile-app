# Decisions

Update this file when a decision changes.

## Scope

- **A staff app for kh-pos** (changed on 2026-10-17; the earlier diner/QR-ordering plan was dropped).
- Done so far:
  - **Staff login** through kh-pos `/api/auth/login`. The token is kept in SecureStore and checked with `/api/user/me` when the app starts.
  - **Table ordering**, working exactly like the kh-pos web restaurant POS, so phones and the web POS share the same orders: login, then tables, then a table's menu, then the order, then Send to kitchen.
    - **Tap a dish to add one at once** (2026-10-17, the user's request), like the web POS. **Hold a dish** for options and a note. The **🛒 cart button** opens a drawer from the right. Fast taps are queued one after another, each reading the latest order, so none is lost or doubled. The badges count queued taps straight away.
    - There's no local cart. Each add goes straight to kh-pos as **pending** (not sent), like the web POS. The table's order on the server is the only source of truth, and the app reloads it after every change and every 15 s.
    - Adding follows the web POS: the first item marks the table taken, gets the next invoice number and opens the order. The same plain item still pending raises its quantity. Anything else, or anything with options or a note, is a new line, followed by its options and note.
    - Prices for staff orders are the menu prices, sent by the app (kh-pos trusts staff, as with the web POS). Option prices come from the modifier items.
    - **Send to kitchen** moves all pending portions to cooking in one call. kh-pos writes the kitchen tickets to `print_queue` for the printer bridge, so the phone never prints.
    - Staff can change the pending quantity of a line, and remove lines the kitchen hasn't started.
    - **Customize Your Order** (opened by tapping a cart line, which closes the drawer; closing it returns to the cart) copies the web POS sheet and its rules:
      - Prepare (pending → cooking) and Serve (all cooking → served).
      - Editing counts: pending always; cooking or served only with order-preparation update + delete, or the OWNER role. At least one portion must remain, and zeroing preparing or served asks for confirmation.
      - Options on/off, a note with an extra charge (added the first time, updated after that), a manual discount ($ or %) and promotions (`/api/discount/applies`).
      - The manual discount isn't limited by role, the same as the web POS. Restricting it is a business decision.
    - Transfers and checkout stay on the web POS for now.
    - **Cart times:**
      - Ordered comes from the line's created time.
      - **Sent** is the first kitchen ticket printed (`kitchenLogs[].printedAt`), or else the time portions last went to cooking. That status time is reliable only with the kh-pos fix (commit "keep a status row's time when portions leave it"). Without that fix, serving overwrote it, so Sent equalled Served.
      - Customize shows who/when on every status row, like the web.
    - The kh-pos MySQL must run in **UTC** like the production server. `print_kitchen_log.printed_at` is a TIMESTAMP column, and on a +07 server it reads 7 hours late.
- Next steps are decided one at a time.
- Staff accounts use a kh-pos role named **"Staff"**, created by `scripts/seed-dev.mjs`. Its permissions: order, restaurant and order-preparation (create, read, update), plus product and category (read).
- The server address comes from `EXPO_PUBLIC_KHPOS_URL` (`.env.local`). During development this is the PC's Wi-Fi address.

## Offline (2026-10-19)

Staff must be able to take orders when the KH POS server can't be reached, and everything is sent when it can again. Code is in `src/lib/offline/`.

- **Not a copy of the kh-pos database.** order-app can sync because it was built for it (a server clock on every record, pull and push endpoints, WatermelonDB). kh-pos has none of that, its web POS writes straight to MySQL, and WatermelonDB would end Expo Go. So the phone keeps a **read cache** and an **outbox of commands**, and kh-pos stays the only source of truth. No kh-pos server change was needed.
- **Storage:** `expo-sqlite` (included in Expo Go). Two tables, versioned with `PRAGMA user_version` (`sqlite-store.ts`, add a new entry to `MIGRATIONS`, never edit a shipped one): `cache` (key, JSON, saved-at) and `outbox` (one row per waiting change). It falls back to memory if SQLite can't open.
- **Reachability** is asked of the server itself (`api.ping`, any HTTP answer counts), not of the internet, so a LAN with no internet is online. Every call also reports whether it got through. After a failed connection the app goes straight to the saved copy for 10 s instead of waiting for another timeout. While offline or while changes wait, it checks every 8 s; it also checks when the app returns to the foreground.
- **Reads** (`data.ts`): tables, menu, categories and settings are saved when read; if the server can't be reached the saved copy is returned and flagged stale. The whole menu is saved page by page at start, on reconnect and every 10 minutes, and menu queries are answered from it offline (`menu-local.ts`). Product photos are not saved. Offline start uses the staff profile saved at login; the token is checked again in the background and a token kh-pos rejects signs the staff member out.
- **Every change can wait** (`engine.ts`): add a dish (with options and note), set a pending quantity, remove a line, set guests, send to kitchen, and everything in Customize Your Order: Prepare and Serve (part or all of a line), serve everything, editing the pending, preparing and served counts, turning options on or off, the note and its charge, the manual discount, promotions, and resend to kitchen. If the server is reachable and nothing is waiting they are done at once exactly as before; if the call fails because of the network, or something is already waiting (to keep the order), they go into the outbox. The screen shows the table with the waiting changes applied (`overlay.ts`, the same rules as kh-pos; money is an estimate, kh-pos recalculates) with new items marked "Not sent yet". Customize works on an item made offline too: its changes join the same queue and replay after the item has been added.
- **Not offline:** checkout and table transfers (the app has neither, they are done on the POS). Promotions can be turned on or off offline only for dishes whose promotion list was loaded while online (lists are saved when a dish is opened in Customize). Staff permissions are checked from the saved profile.
- **Replay is safe to repeat.** Line ids are made on the phone and reused on every attempt. Each replay first reads the table from kh-pos: a line that already exists is not added again (only its options and note are completed); a merge into an existing line records the quantity it started from, so a lost answer doesn't add the portions twice; set-quantity, set-guests, set-note, set-discount and remove are absolute and repeat harmlessly; options and promotions are turned on or off only if they aren't already; Prepare and Serve record the portions they started from, like a merged add, so a lost answer doesn't move them twice; send-to-kitchen and serve-all with nothing left to move do nothing; resend to kitchen is the one that can print twice if its answer is lost. Local line ids that were merged into another line are mapped (`idmap` in the cache) for later commands.
- **Conflicts: kh-pos wins and nothing is lost silently.** A network failure stops the replay and keeps everything. A refusal by kh-pos (item gone, table closed, no permission) marks that command **failed** with kh-pos's message, and the replay carries on with the rest. Failed changes are listed under "Needs attention" with Retry and Discard and are not shown as if they happened. An expired login stops the replay and keeps the outbox for the next login.
- **Outbox belongs to a staff member.** Each change records who made it; only that person's session replays it, and it survives logout.
- **Offline login (2026-10-19).** The user table is **not** copied to phones: kh-pos keeps passwords as bcrypt hashes and a login returns the user's permanent token, so copying the table would put every staff member's credentials on every phone, and no API exposes it anyway. Instead, after a staff member logs in **with a connection**, that phone keeps for that person only: a salted PBKDF2-HMAC-SHA256 hash of the password (20,000 rounds, `@noble/hashes`, count stored with the hash) and the token, in `expo-secure-store` (Android Keystore / iOS Keychain), plus their staff profile in the local database. With the server unreachable (no answer to `ping` within 4 s), a password typed on that phone is checked against that hash and the saved token is used; the token is confirmed in the background once the server is back. Five wrong passwords pause logins for that name for a minute. Logging out keeps these records (that is what lets someone log in again offline); a password kh-pos refuses online, or a token it rejects, deletes them. Code: `src/lib/offline-login.ts`, `secure-vault.ts`, `session.tsx`. Limits: it only works for people who logged in on that phone with a connection after this version (an older login has no hash: log out and log in once online); a password changed on the server still works offline on a phone that hasn't seen the change; the hash is only as safe as the phone's secure storage, and kh-pos tokens never expire (see README notes).
- **Known limits:** the invoice number is assigned by kh-pos when the first dish of an offline order is sent (the phone shows "Not sent yet"). Set-quantity is absolute, so an offline quantity change overwrites a change someone else made meanwhile. The kitchen ticket prints only after sync. The very first login on a phone needs the server. Offline ordering has not been tried on a real phone yet.

## Look

- Matches the kh-pos web app: shadcn "zinc" colours (`src/ui/theme.ts`). The login screen copies `/admin/login`: a centred card titled "Login" with Username, Password and a full-width black Login button.
- Khmer (default, like kh-pos) and English, with matching keys checked by a test. "Login" uses kh-pos's own Khmer, ចូលប្រើប្រាស់.

## Mobile stack

- Expo **SDK 57** (React Native 0.86, React 19.2), Expo Router with routes in `src/app/`, and TypeScript in strict mode. It runs in **Expo Go**.
  - It was moved from SDK 58 to 57 because the Play Store Expo Go (2026-10-17) still only supports SDK 57. Move to SDK 58 once Expo Go does.
- Libraries: `expo-router`, `expo-secure-store` (login token), `expo-crypto` (order line ids, which kh-pos requires to be UUIDs), `i18next` + `react-i18next`.
- pnpm with `node-linker=hoisted`, as Metro requires. Android and iOS only, with no web target.

## Web modules on the phone (2026-10-20)

- **One shape for every module:** logic and request bodies in `lib/<module>.ts` (pure, tested, mirrors the kh-pos zod schema), a thin screen in `app/`, and a registry entry in `lib/modules.ts` gated by the same permission resource the web menu uses. Plain list-and-form modules use the config-driven `EntityScreen`; the rest are custom screens.
- **Offline by exception:** only table ordering is queued (outbox). Other modules read through `cachedRead` and say "needs the server" to save. Queuing stock, accounting or cinema writes would risk double-posting and wrong stock; kh-pos has no idempotency keys for them.
- **Selling at the counter** (retail, cinema) creates the order only at Charge and deletes it again if payment is cancelled, so no draft is left behind and seats are freed.
- **Data the phone does not edit is preserved** on save: pricing-template seat types, hall features and zones.
- **Accounting has no permission in kh-pos**, so the phone follows the web: shown when the branch's Accounting setting is on, usable by any signed-in staff (`OPEN_RESOURCES`). Revisit if kh-pos adds a permission.

# History

What was done in this project, newest work last. For the reasons behind the design see [DECISIONS.md](DECISIONS.md). Nothing here has been tried on a real phone unless it says so: the checks were the typecheck, the unit tests, and building the Android bundle.

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

- Try offline mode on two real phones (airplane mode on both, then back on) and fix what it finds.
- Run the app's ordering code against a real kh-pos with `pnpm e2e` (needs the staff password).
- Save product photos for offline use.
- Add an idempotency key to kh-pos resend so it can never print twice.
- Fix the older lint errors.

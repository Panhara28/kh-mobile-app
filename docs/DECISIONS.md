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
- Next steps are decided one at a time.
- Staff accounts use a kh-pos role named **"Staff"**, created by `scripts/seed-dev.mjs`. Its permissions: order, restaurant and order-preparation (create, read, update), plus product and category (read).
- The server address comes from `EXPO_PUBLIC_KHPOS_URL` (`.env.local`). During development this is the PC's Wi-Fi address.

## Look

- Matches the kh-pos web app: shadcn "zinc" colours (`src/ui/theme.ts`). The login screen copies `/admin/login`: a centred card titled "Login" with Username, Password and a full-width black Login button.
- Khmer (default, like kh-pos) and English, with matching keys checked by a test. "Login" uses kh-pos's own Khmer, ចូលប្រើប្រាស់.

## Mobile stack

- Expo **SDK 57** (React Native 0.86, React 19.2), Expo Router with routes in `src/app/`, and TypeScript in strict mode. It runs in **Expo Go**.
  - It was moved from SDK 58 to 57 because the Play Store Expo Go (2026-10-17) still only supports SDK 57. Move to SDK 58 once Expo Go does.
- Libraries: `expo-router`, `expo-secure-store` (login token), `expo-crypto` (order line ids, which kh-pos requires to be UUIDs), `i18next` + `react-i18next`.
- pnpm with `node-linker=hoisted`, as Metro requires. Android and iOS only, with no web target.

# Decisions

Agreed on 2026-10-17. Update this file when a decision changes.

## Scope (v1)

- **Dine-in only:** scan the table QR, browse the menu, use a cart, send the order to the kitchen, and see the table's order and kitchen status.
- Not in v1: Google login, promotion sets, payment (staff take payment at the POS), take-away and delivery.

## Backend

- The app talks to an unmodified **kh-pos** server. It uses the same endpoints and parameters as the kh-pos web menu (`/menu`), plus the security fixes on kh-pos branch `fix/customer-security`, which are required:
  - Walk-in tokens are bound to the scanned table.
  - The server sets prices, branch, table and invoice number for customer orders.
- The table QR code is the web menu link, `https://<shop>/menu?warehouse=<id>&table=<id>`. The app reads the server address, branch and table from that link, so the same QR codes work for the web menu and the app.
- Customer login is kh-pos **walk-in login**. It requires the phone to be inside the branch's GPS radius (`warehouse.walkin_radius_in_meters`), which is why the app needs location.

## Mobile stack

- Expo **SDK 58** (React Native 0.88, React 19.3), Expo Router with routes in `src/app/`, and TypeScript in strict mode.
  - Unlike the order app (SDK 54, which WatermelonDB requires), there is no offline database here. Ordering needs the server anyway.
  - It runs in **Expo Go** during development.
- Libraries:
  - From the order app: `expo-router`, `expo-secure-store` (token), `expo-crypto` (ids), `i18next` + `react-i18next`, `zod`.
  - Added for this app (approved): `expo-camera` (QR scanning) and `expo-location` (walk-in GPS check).
- pnpm with `node-linker=hoisted`, as Metro requires.
- Look: matches the kh-pos web menu.
  - shadcn "zinc" colours (`src/ui/theme.ts`).
  - Category chips, a 2-column product grid of rounded cards, and a sticky header with the table and cart.
  - Prices formatted like the web (`$1,234.50`, `1,235៛`), using the branch's `CURRENCY` setting.
  - The web uses the Kantumruy Pro font for Khmer. The app uses the system Khmer font, so it needs no font package.
- Languages: Khmer (default, like kh-pos) and English, with matching keys checked by a test.

## Tests

- Logic tests run in Node with ts-jest: the API client, money formatting, i18n, and later QR parsing and cart maths. Screens are checked on a phone in Expo Go.

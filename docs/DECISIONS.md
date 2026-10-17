# Decisions

Update this file when a decision changes.

## Scope

- **A staff app for kh-pos** (changed on 2026-10-17; the earlier diner/QR-ordering plan was dropped).
- Done so far:
  - **Staff login** through kh-pos `/api/auth/login`. The token is kept in SecureStore and checked with `/api/user/me` when the app starts.
  - The **branch menu**: categories, search, and a product grid with prices in the branch currency. The menu is read-only so far.
- Next steps are decided one at a time.
- Staff accounts use a kh-pos role named **"Staff"**, created by `scripts/seed-dev.mjs`. Its permissions: order, restaurant and order-preparation (create, read, update), plus product and category (read).
- The server address comes from `EXPO_PUBLIC_KHPOS_URL` (`.env.local`). During development this is the PC's Wi-Fi address.

## Look

- Matches the kh-pos web app: shadcn "zinc" colours (`src/ui/theme.ts`). The login screen copies `/admin/login`: a centred card titled "Login" with Username, Password and a full-width black Login button.
- Khmer (default, like kh-pos) and English, with matching keys checked by a test. "Login" uses kh-pos's own Khmer, ចូលប្រើប្រាស់.

## Mobile stack

- Expo **SDK 57** (React Native 0.86, React 19.2), Expo Router with routes in `src/app/`, and TypeScript in strict mode. It runs in **Expo Go**.
  - It was moved from SDK 58 to 57 because the Play Store Expo Go (2026-10-17) still only supports SDK 57. Move to SDK 58 once Expo Go does.
- Libraries: `expo-router`, `expo-secure-store` (login token), `i18next` + `react-i18next`. No other packages.
- pnpm with `node-linker=hoisted`, as Metro requires. Android and iOS only, with no web target.

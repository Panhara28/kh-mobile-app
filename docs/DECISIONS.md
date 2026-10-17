# Decisions

Update this file when a decision changes.

## Scope

- **A staff app for kh-pos** (changed on 2026-10-17; the earlier diner/QR-ordering plan was dropped).
- Current step: **the login screen UI only.** It isn't connected to the kh-pos login API yet. The next steps are decided one at a time.

## Look

- Matches the kh-pos web app: shadcn "zinc" colours (`src/ui/theme.ts`). The login screen copies `/admin/login`: a centred card titled "Login" with Username, Password and a full-width black Login button.
- Khmer (default, like kh-pos) and English, with matching keys checked by a test. "Login" uses kh-pos's own Khmer, ចូលប្រើប្រាស់.

## Mobile stack

- Expo **SDK 57** (React Native 0.86, React 19.2), Expo Router with routes in `src/app/`, and TypeScript in strict mode. It runs in **Expo Go**.
  - It was moved from SDK 58 to 57 because the Play Store Expo Go (2026-10-17) still only supports SDK 57. Move to SDK 58 once Expo Go does.
- Libraries: `expo-router`, `expo-secure-store` (for the login token later), `i18next` + `react-i18next`.
- pnpm with `node-linker=hoisted`, as Metro requires. Android and iOS only, with no web target.

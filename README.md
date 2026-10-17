# KH POS staff app

Staff mobile app for [kh-pos](https://github.com/sokphaladam/kh-pos), working like the kh-pos web restaurant POS:

1. **Log in** with a kh-pos username and password.
2. **Tables:** the branch's tables, each with its status, open order total and items not yet sent.
3. **Tap a table** to see the menu. Tap a dish to choose quantity, options and a note, then **Add to order**.
4. **The table's order:** each line with its kitchen status (not sent, cooking, served). Staff can change or remove items that haven't been sent, then **Send to kitchen**. kh-pos queues the kitchen tickets for the kitchen printer itself.

Payment is taken at the POS.

Built with Expo SDK 57, Expo Router and TypeScript. It runs in **Expo Go** during development. See [docs/DECISIONS.md](docs/DECISIONS.md) for the choices behind it.

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

## Checks

```bash
pnpm test          # API client, order logic, menu and money helpers, translations
KHPOS_URL=http://localhost:3001 STAFF_PASSWORD=... pnpm e2e   # the app's ordering code against a real kh-pos (dev only; cleans up after itself)
pnpm typecheck
npx expo-doctor
```

## Notes

- kh-pos staff tokens never expire and are built from the phone number plus the creation time, so they can be guessed. This is an issue to fix in kh-pos before going live.
- When two phones open orders at the same moment, kh-pos can suggest the same invoice number to both (it doesn't reserve it). The app detects this and retries with a fresh number, or adds to the other phone's order on the same table. The kh-pos web POS doesn't do this.
- Product search matches parts of words: kh-pos uses MySQL full-text search. The web menu returns the same results.

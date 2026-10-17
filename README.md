# KH POS staff app

Staff mobile app for [kh-pos](https://github.com/sokphaladam/kh-pos). Staff log in with their kh-pos username and password and see their branch's menu.

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

It prints the staff username and password. If you don't set `STAFF_PASSWORD`, it generates one.

## Checks

```bash
pnpm test          # API client, menu and money helpers, translations
pnpm typecheck
npx expo-doctor
```

## Notes

- kh-pos staff tokens never expire and are built from the phone number plus the creation time, so they can be guessed. This is an issue to fix in kh-pos before going live.
- Product search matches parts of words: kh-pos uses MySQL full-text search. The web menu returns the same results.

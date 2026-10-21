# Profile menu: web app vs phone

Checked in the real web app in Chrome (logged in as the admin test user on localhost, nothing saved or changed): the menu has Open Shift, Change Password, Name this device, Print & Device Settings, Settings and Log out; the three dialogs were opened and match the source (`nav-user.tsx`, `user-change-password.tsx`, `device-name-dialog.tsx`, `device-print-settings-dialog.tsx`). **The phone screen has not been opened on a phone.**

Phone: `app/account.tsx` (More > My account), `lib/account.ts`, `lib/device.ts`, `lib/device-headers.ts`.

| Web | Phone |
|---|---|
| Open Shift / Close Shift (needs create permission on `shift`) | Button to the Shift screen, named by whether a shift is open |
| Change Password: current, new, confirm, show/hide, strength (Weak/Medium/Strong), checklist (8 chars, upper, lower, number, special), button enabled when filled and matching | Same |
| Name this device: name (100 chars), detected device, device ID; the name and ID go to the server with every request (X-Device-Id, X-Device-Label) for the activity log | Same; sent from app start, kept on this phone |
| Print & Device Settings: print server address (ws:// or wss://) with Test, Save, Reset; receipt printing method (browser or print server) and printer | Same, with "Phone print" instead of "Browser print" |
| Settings (when the role has setting tiles) | Button to Settings when the role may read `setting` |
| Log out | Same, asks first |

**Differences:** the web's Scan (QR) button is not on the phone; type the address. Choosing "Print server" only saves the choice and printer name: receipts still print through the phone print dialog, because the phone has no print-server client yet. Test opens a WebSocket to the address and reports connected, no answer or error.

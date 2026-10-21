# Payment methods: web app vs phone

Checked against the web source (`src/components/gui/setting/payment/*`, `src/app/api/payment/method/*`) on 2026-10-20. The list endpoint was read from the running server. **The screen has not been opened on a phone.**

| Web | Phone (`app/payment-methods.tsx`, `lib/payment-methods.ts`) |
|---|---|
| List: #, Method, Created Date | Same (`#1 · 2026-10-20 09:15` under the name) |
| Add a method (needs create permission) | Same |
| Edit: the method name (needs update permission) | Same |
| Delete, asks "Are you sure you want to delete payment method X?" (needs delete permission) | Same |
| Permissions on `payment` | Same |
| The form is one field, "Method" | Same |

**Differences:** the web saves an empty name; the phone needs a name. Search is added on the phone.

**Where the methods are used:** the checkout payment screen on the phone (table checkout, retail POS, cinema ticket sale) lists exactly these methods.

**Offline:** the list is read from the saved copy (and is also what checkout uses offline); add, rename and delete need the server.

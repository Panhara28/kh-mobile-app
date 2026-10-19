# Settings (Profile > Settings): web app vs phone

Checked against the web source (`setting-dialog.tsx`, `setting-list.tsx`, `setting-core.tsx`, `setting-utils.tsx` and every editor in `components/gui/setting/`) and the live local server (read only: the setting rows were listed and run through the phone's parsers, nothing saved). **The phone screens have not been opened on a phone.**

Phone: `app/settings.tsx` (the hub), `app/users.tsx`, `app/deliveries.tsx`, `app/payment-methods.tsx`, `ui/users/bind-section.tsx`, `lib/users.ts`, `lib/delivery.ts`, `lib/payment-methods.ts`, `app/settings-general.tsx` (General), `ui/settings/editors.tsx` (the editors), `lib/settings-general.ts`, `lib/settings-hub.ts`, `lib/use-setting-rows.ts`.

## The hub

The web dialog shows a tile for each section the role has `read` on: **General** (`setting`), **Users** (`users`), **Delivery** (`delivery`, only when the POS type is Restaurant) and **Payment Method** (`payment`, only on the main branch). The phone shows the same tiles by the same rule. All four sections are built: General (below), Users, Delivery and Payment Method (further down).

## General

Same as the web: every setting option is a category; the saved text of each setting is written exactly as the web writes it (`PUT /api/setting` with `{id, option, value}`), one Save per setting row.

| Web | Phone |
|---|---|
| Category list from the options in `GET /api/setting` (this branch's rows plus the shared ones) | Same list, a tap opens the editor |
| Restaurant sections (Print Server, Table Shape, Table Selection) only when TYPE_POS is Restaurant; Print Socket only for Cinema | Same |
| Currency and Exchange Rate only on the main branch (or a developer) | Same |
| A branch row can be edited anywhere, the shared (all branches) row only on the main branch | Same; each row is labelled "This branch" or "All branches" and says why it is read only |
| Brand, Currency, Exchange Rate, Editable Order Day, Expiry Setting, Inventory, Invoice Receipt, QR Code, Label Print, Print Server, Print Socket, Product Menu Rules, Order Discount Rules, Type POS, Table Selection, Table Shape, Accounting, Brand Integration, the unnamed RTB text, and unknown options (editor guessed from the value) | All of these have an editor on the phone |
| Number settings accept any number | Same, but an empty or non-number box is refused (a blank rate would break prices) |
| Invoice Receipt: template, logo upload, title, auto reset number (box ticked means "0", as the web), limit product name lines, discount format, total discount option, receipts per checkout, four paddings | Same fields, same comma separated text. Commas typed into the title or logo address are removed, because the text is split on commas |
| Product Menu Rules: only for sale, only in stock, banner upload, QR and copy of the public menu link | Same rules and banner; the link is shown as text you can press and hold (no copy button, no QR code) |
| Print Server: group by, printers list (add, edit, remove, the last printer can't be removed), other keys kept | Same; other keys in the stored text are kept |
| Order Discount Rules: amount rule, quantity rule, per line variant cap and what it counts by | Same, stored as `minAmount` / `minQty` like the web |
| Type POS: system type, environment, shared order draft (turned on by Restaurant) | Same |

## Differences (not on the phone)

- **Accessibility** (roles and permissions) is listed but opens a note: it is the roles editor and goes with the Users section later.
- **Type POS: "Clean up dummy data"** (deletes test data on the server) is not on the phone on purpose.
- **Type POS side effect:** on Save the web creates a "movies" category when the type becomes Cinema and tries to delete one with a placeholder id otherwise. The phone only saves the setting. (The web delete uses `"movies-category-id"`, which looks like an unfinished placeholder.)
- **Test print buttons** (Inventory printer, Print Socket ticket, Invoice preview) are not on the phone: it has no print-server client yet. The invoice template picker has no live preview.
- **Brand Integration** tokens are hidden when listed and typed in a hidden box. The setting still holds them in plain text on the server, as the web does.
- **Image uploads** (logo, QR code, banner, brand icon) go through the phone's photo library, 5 MB at most, using the same upload as product photos.
- Saving needs the server (a warning appears offline). The list is cached for reading offline.
- The phone also requires `update` on `setting` to show Save; the web only checks the branch rule on screen and leaves the rest to the server.

## Checked on the live server (read only)

20 setting rows for the admin on the Restaurant branch. The category list matches the web rule (Currency and Exchange Rate on main only, Print Socket hidden for Restaurant). Invoice Receipt, Label Print and Order Discount Rules parse and write back to identical text. Print Server writes back with `group_by` added and keys re-ordered, which is what the web does on any save. Nothing was saved.

## Users

Checked against `user-layout.tsx`, `user-list.tsx`, `sheet-user-create.tsx`, `user-form.tsx`, `bind-user-section.tsx`, `user-reset-password.tsx` and the `/api/user` routes. Read only on the live server: the 66 users of this branch load, every one passes the edit checks, and every role id is in the role list. Nothing was saved.

| Web | Phone |
|---|---|
| List: #, profile picture, full name, username, phone, role ("No Role"), branch | Same, as a card per person with the picture, search box and the role as a badge |
| Add User: picture, full name, phone (a number starting 1-9 gets a leading 0), username, password, role | Same. The id is made on the phone like the web does |
| Edit User: same without username and password, plus **Bind Users** (branches the person can also sign in from; Main is fixed, others can be added or removed; Save sends the whole list) | Same |
| Role: one role, ticking the same one again clears it; new users start with the web's default role id | Same; the default is used only if this server has that role |
| Reset Password (owner only, not yourself): new and confirm, at least 6 characters | Same, button on each row |
| Delete user (not yourself), asked first | Same |
| Add / edit / delete follow the role's permission on `users` | Same |

**Differences:** the web sends whatever is typed; the phone also needs a full name, and a username and password for a new user, so an empty account is not made. **Upload Excel** (bulk add) is not on the phone. Bind Users needs the server (it loads when you open Edit). The server returns the old login `token` of every user in the list; the phone drops it before using it (`lib/redact.ts`).

## Delivery (restaurant POS only)

Checked against `delivery-layout.tsx`, `delivery-list.tsx`, `delivery-sheet.tsx` and the customer API (`type=delivery`). The local server has no delivery customers, so only the shape was checked.

| Web | Phone |
|---|---|
| List: #, name, address, extra price (`$1.50` or `-`), branch, created date, created by, orders (always 0, the server does not fill it) | Same facts on each card |
| Add / edit: Delivery Name (also stored as the phone number), Address, Extra Price ($, not negative) | Same; a name is required |
| Delete asks `Are you sure you want to delete customer "name"?` | Same |

## Payment Method (main branch only)

Checked against `payment-list.tsx`, `sheet-payment.tsx` and `/api/payment/method`. Live: 2 methods (CASH, ABA Bank) list with their created dates.

| Web | Phone |
|---|---|
| List: #, method, created date; add, rename, delete (asked first) | Same |

**Difference:** the phone refuses an empty method name (it would make a blank checkout button).

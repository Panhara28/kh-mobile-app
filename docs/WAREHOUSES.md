# Warehouse (Branches): web app vs phone

Checked against the web source (`src/components/gui/warehouse/*`, `src/app/api/warehouse*`) on 2026-10-20. The list and both save bodies were checked read-only against the running server (2 branches: The Floor, The Mood (Main)). **The screen has not been opened on a phone.**

Phone: `app/branches.tsx`, `lib/org.ts` (branch section).

| Web | Phone |
|---|---|
| List: #, image, name ("(Main)" on the main branch), owner, phone, address, created date | Same, as cards |
| Add (needs create permission on `warehouse`) | Same |
| Edit (update permission) | Same |
| Delete asks "Delete warehouse / Are your sure you want to delete warehouse X?" (delete permission) | Same wording |
| Form: image upload / remove, Warehouse Name *, Owner Name, Phone, Use Main Branch Visibility, Address, Latitude, Longitude | Same (picture from the photo library) |
| Manager Account (Username *, Password * with show/hide) only when creating | Same |
| Create / Update sends every field; the manager login only when creating | Same bodies, accepted by the server's schemas |

**Differences:** the web has no client checks and shows the server's "Required" failure; the phone checks the server's minimums first (name and owner 3 characters, username and password 4) and that coordinates, when typed, are numbers. The phone also keeps a "Stock slots" button on each card (the web has Slot as its own menu item).

**Bug fixed while doing this:** the phone read branches from `GET /api/warehouse-v2`, which kh-pos does not have (405). The web lists from `GET /api/warehouse`. The Branches, Users, Products, Categories, Product groups and Replenishment screens all read their branch list from the wrong address, so on a live server they would have shown no branches (only a saved copy could have helped). All now use `/api/warehouse`.

**Offline:** the list is read from the saved copy; add, edit, delete and picture upload need the server.

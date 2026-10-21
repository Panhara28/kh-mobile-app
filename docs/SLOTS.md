# Slot: web app vs phone

Checked against the web source (`src/components/gui/slot/*`, `src/app/api/warehouse/slot/*`) on 2026-10-20. The slot lists of both branches (one "POS" slot each) were read from the running server and their edit/create bodies parsed with the server's schemas. **The screen has not been opened on a phone.**

Phone: `ui/slots-view.tsx`, routes `app/slots/index.tsx` (the branch you work in, like the web menu item) and `app/slots/[warehouseId].tsx` (opened from a branch card), `lib/org.ts` (slot section).

| Web | Phone |
|---|---|
| Menu item "Slot" for the current branch, permission `slot` | More > Stock > Slot; also from Branches |
| List: #, name ("(POS)" on the sales slot), created date, newest first, paged, searched by name | Same, search box and load more |
| Add / Edit (create / update permission): Slot Name, For Replenishment | Same; Save disabled without a name |
| Delete asks "Are your sure you want to delete slot X?" (delete permission) | Same question |

**Differences:** the web delete dialog is titled "Delete warehouse" (a copy slip); the phone says "Delete slot". The phone shows a "For replenishment" badge on such slots.

**Offline:** the list is read from the saved copy; add, edit and delete need the server.

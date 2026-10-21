# Back Log: web app vs phone

Checked against the web source (`src/components/gui/back-log/*`, `src/app/hooks/use-query-back-log.ts`) on 2026-10-20. The list was read from the running server (read-only); nothing was resolved. **The screen has not been opened on a phone.**

Phone: `app/backlog.tsx` (More > Stock > Backlog), `lib/stock-activity.ts` (backlog section).

| Web | Phone |
|---|---|
| Paged list, 30 per page, in the order the server gives | Same, loads more at the end (the old screen sorted oldest first, which the web does not) |
| Row: BL-001 code, product image + "Title (Variant)" + SKU, slot ("(POS)") and branch, current stock of that slot, quantity, created at and by | Same, as cards |
| Resolve: "Resolve was done." or "Failed to resolve back log." | Same, no extra permission check (the web has none beyond the menu) |

**Offline:** each page is read from the saved copy; Resolve needs the server.

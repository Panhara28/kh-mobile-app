# Order Return: web app vs phone

Checked against the web source (`src/components/gui/return/*`, `src/app/api/pos/return/*`) on 2026-10-20. The local database has **no returns**, so the list and Stock info were checked from source only. **The screen has not been opened on a phone**, and no return was put back in stock.

Phone: `app/returns.tsx` (More > Stock > Returns), `lib/stock-activity.ts` (return section).

| Web | Phone |
|---|---|
| Two tabs: Returned, Stock In (server filter), 30 per page | Same, loads more at the end |
| Row: RTN-00001 code, order invoice, product image + "Title (Variant)", quantity, refund amount, reason in quotes, status badge | Same, as cards |
| Status tooltip: returned time and who, stock-in time and who | Shown as lines on the card |
| Menu: Order Detail (opens the order), Stock info | Buttons with the same names |
| Stock info sheet: product, slot ("(POS)"), return quantity; "Returned items go into this slot." | Same |
| Return Stock asks "Return Stock / Do you want to proceed with returning the item(s) to the selected slot?" then "Return item was stock in" or "Failed to return stock in" | Same wording |
| Permission `return` | Same (the old phone screen used the `order` permission) |

**Differences:** the RTN number keeps counting across loaded pages (the web restarts at 1 on every page). Putting an item back is offered on both tabs, as on the web; the server refuses one that is already in stock.

**Offline:** each page is read from the saved copy; putting back needs the server.

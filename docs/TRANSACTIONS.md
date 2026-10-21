# Transactions: web app vs phone

Checked against the web source (`src/components/gui/transaction/*`, `src/app/api/inventory-transactions/route.ts`) on 2026-10-20. The local database has **no inventory transactions**, so the list was checked from source only, not against data. **The screen has not been opened on a phone.**

Phone: `app/stock-movements.tsx` (More > Stock > Stock movements), `lib/stock-activity.ts`.

| Web | Phone |
|---|---|
| Status filter with 17 entries: All, Product Sale, Purchase Order, Stock In/Out, Adjustment In/Out, Replenishment In/Out, Compose In/Out, Transfer In/Out, Conversion In/Out, Damage, Return | Same 17 chips (the old screen lacked Compose and Conversion) |
| Rows newest first, paged 30 at a time | Same, loads more at the end (the old screen read only the latest 300) |
| Columns: product (+ image), transaction, slot (+ "(POS)") with branch name, date "MMM DD, YYYY", quantity, amount | Same, as cards |
| Quantity: sales without the minus sign | Same |
| Amount: cost per unit × quantity; a sale unsigned, others with "-" when negative | Same |
| Transaction name: "Replenishment" for both in and out | Same on the row; the filter says In / Out |

**Differences:** the web hard-codes `$` in the amount; the phone uses the branch currency. The old "who did it" line is dropped because the web does not show it.

**Offline:** each page is read from the saved copy when the server can't be reached.

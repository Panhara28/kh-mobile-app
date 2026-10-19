# Reports: web app vs phone

Checked against the web source (`src/app/admin/(admin)/reports/*`, `src/components/gui/report/*`) on 2026-10-20. Sale breakdown, guest, sale item and void data were read from the running server (read-only) and run through the phone's code. The local database has no stock rows worth showing and no expiry data. **The screens have not been opened on a phone.**

Phone: `app/report/[kind].tsx`, `ui/reports/sale-report.tsx`, `lib/sale-report.ts`, `end-of-day.ts`, `sale-items.ts`, `void-report.ts`, `guest-report.ts`, `stock-report.ts`, `reports.ts`.

| Report | What now matches the web |
|---|---|
| Sale Report | Filters (branch for the owner, users, categories, product), group by product or time, list or chart (revenue / quantity / profit, top 30 with ties), the web columns incl. "Ordered At", active-filter count, Export |
| Sale Breakdown | The same table with date range and group by product |
| End of Day | Total sales, transactions, average order, total discounts, payment methods, service types ("Walk In"), category performance, discounts applied, top 10 customers, report summary, Print and Export |
| Sale Item Summary | Total items, quantity, revenue, numbered table with grand total, Print and Export |
| Void Order | The four cards, orders grouped with their lines, who ordered or checked out, quantity and amount differences, the print log, Export |
| Guest Number | Total, daily average, peak hour, grand total / daily total with hourly rows that open, Export |
| Stock Report | Branch, category and date filters, cost / price / quantity / totals per row, Export |
| Expiry | Total items and value, status cards, search by name / SKU / barcode, status, slot and category filters |
| Sale Product | Top 30 products (ties kept) by revenue or quantity, the total, same data as the breakdown. The web has no menu item for it; the phone lists it with the sale reports |
| Cinema Sales | Grand totals, movies with search, minimum tickets and amount, sort by showtime count / tickets / amount, open a movie for its showtimes, Export and Send to email |

**Bug fixed:** the server refuses the stock report without `startDate` and `endDate`; the phone sent neither, so Stock Report always failed. It now sends the dates (and has a date bar).

**Differences:** Export shares the rows as CSV text (the web writes an .xlsx file); Print uses the phone's print dialog. The stock and sale-report filters for branch show only to the owner. Dashboard is unchanged. The cinema report has no data in the local database (no movies), so it was checked against the source only.

**Offline:** each report is read from the saved copy when the server can't be reached.

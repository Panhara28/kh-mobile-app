# Shift: web app vs phone

Checked against the web source (`src/components/gui/shift/*`) on 2026-10-20. The shift list was read from the running server (334 shifts, read-only) and run through the phone's detail and receipt code; no shift was opened or closed. **The screen has not been opened on a phone.**

Phone: `app/shift.tsx`, `ui/shift/shift-list.tsx`, `ui/shift/shift-detail.tsx`, `lib/shift.ts`.

| Web | Phone |
|---|---|
| Top bar button "Open Shift" / "Close Shift" | The current-shift card on top: open form, or the live summary with Close |
| Open dialog: exchange rate, starting USD and KHR | Same (and it still works offline: the opening is sent later) |
| Close dialog: expected and actual cash in both currencies, "Cash Discrepancy Detected" when USD differs by more than 0.01 or KHR by more than 1 | Same expected line and counted fields, plus the same warning |
| "Shift Management" table of the cashier's shifts (open and closed), 30 per page: status, opened by, opened / closed date, opening cash, closing cash, actual cash, total sale + qty of bills, difference (closed only) | Same fields as cards, "Load more" for the next 30 (the old screen showed closed shifts only, in a short summary) |
| Row menu: Print, View Details | Buttons with the same names |
| Shift Details: information (rate, opened / closed date and by, duration), cash flow (opening, expected, actual, variance), payment methods with transaction counts, sales and statistics (total sales, returns, customers, average spending, bills, card slips) | Same sections |
| Print: the handover receipt (opening / closing / actual / difference / handover amount in both currencies, payment methods, sales, returns) | Same lines through the phone's print dialog, plus Share as text |
| Permission `shift` | Same |

**Differences:** the web receipt is formatted for a receipt printer by the browser; the phone prints a simple page through the system print dialog. The web cash-flow cards swap the currency order when the branch currency is KHR; the phone always shows USD then KHR.

**Offline:** opening and closing are kept on the phone and sent later; the list is read from the saved copy.

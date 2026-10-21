# Categories: web app vs phone

Checked against the web source (`src/components/gui/category/*`, `src/app/api/category/*`, `src/lib/server-functions/category/*`) on 2026-10-20. The save body was parsed with the server's own schema for all 30 categories in the local database (all valid). **The screen has not been opened on a phone.**

| Web | Phone (`app/categories.tsx`, `lib/categories.ts`) |
|---|---|
| List: picture (initials when none), title, description | Same |
| Products for sale / all products, coloured: all green, none red, some amber | Same |
| Printer, created date, sort order, Exclude Fee Delivery (Yes / No), Mark Extra Fee | Same (shown as small badges) |
| Search | Same (title and description; done on the phone from the loaded list) |
| Add (main branch only, needs create permission) | Same |
| Form: Image upload with preview, Title, Description, Printer (optional, "No printer" or a printer), Sort Order, Exclude Fee Delivery, Extra Delivery Fee; Save disabled without a title | Same |
| In a branch that is not the main one: title, description, image and sort order are read-only; the printer can still be set for that branch | Same |
| Edit | Same (needs update permission) |
| Delete, confirmed (main branch, needs delete permission) | Same |
| Product For Sale → Enable / Disable (confirmed): every product of the category | Same |
| The form has no parent category; an existing category keeps its parent | Same. The phone's old "Parent category" field was removed to match |

**Not on the phone:** nothing from the web Category page is missing. Pagination is replaced by loading every page and scrolling.

**Offline:** the list is read from the saved copy; add, edit, delete, picture upload and For Sale need the server.

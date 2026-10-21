# Suppliers and supplier product prices: web app vs phone

Checked against the web source (`src/components/gui/supplier/*`, `src/app/api/supplier/*`) on 2026-10-20. The lists were read from the running server (read-only). **The screens have not been opened on a phone.**

## Supplier (`app/suppliers.tsx`, `lib/suppliers.ts`)

| Web | Phone |
|---|---|
| List: #, name, contact name, consignment, phone, address, notes, created date (blank shows N/A) | Same, as a card per supplier |
| Search | Same, on the loaded list (name, contact, phone, email, address, note) |
| Add / Edit form: Name, Contact Name, Contact Email, Contact Phone, Address, Notes, Consignment; Submit disabled without a name | Same |
| Delete asks "Delete Supplier / Are you sure? you want to delete this supplier?" | Same wording |
| Permissions on `supplier` (create, update, delete) | Same |

## Supplier product price (`app/supplier-prices.tsx`, `lib/supplier-prices.ts`; reached from the Suppliers screen and the More menu)

| Web | Phone |
|---|---|
| Search; filter by supplier and by product; order by price low-high / high-low; Reset | Same (supplier chips, product picker, order chips) |
| List: image, product (variant), SKU, supplier + phone, price, scheduled price, scheduled at | Same, as cards |
| Add: supplier, product, price (price above 0) | Same; sends the list the server expects |
| Edit: price, scheduled price and date; supplier and product fixed | Same (date typed as YYYY-MM-DD) |
| Delete asks first | Same |
| Paging | Loads more at the end of the list |

**Differences:** the web saves a supplier with an empty name; the phone needs one (the one supplier in the local database has an empty name, so editing it on the phone asks for a name). The web server ignores the supplier and product filters while a search text is set. The server reads `limit` in base 30 (`parseInt(x, 30)`), so `limit=30` returns up to 90 rows; the phone pages by the number of rows already loaded, so this is harmless.

**Checked:** the supplier list round-trips through the phone form and save body. The local database has 1 supplier and 0 prices, so the price list, filters, images and the price bodies against the server schema were checked from source only, not against data.

**Offline:** both lists are read from the saved copy; add, edit and delete need the server.

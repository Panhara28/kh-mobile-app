# Products: web app vs phone

What the kh-pos web Product module does, and where each part is on the phone. Checked against the web source (`src/components/gui/product/*`, `src/components/product/*`, `src/app/api/product-v2/*`) on 2026-10-20.

**How it was checked.** The request bodies the phone builds were parsed with kh-pos's own zod schemas (create, update, movie). All 33 products in the local database were loaded from the running server, put through the phone's form and back to an update body, and every one passed the server's schemas (`product-form.ts`, tests in `product-form.test.ts`). **The screens themselves have not been opened on a phone.**

## Add / Edit product (`app/product-edit/[id].tsx`, `ui/product-form/*`, `lib/product-form.ts`)

| Web | Phone |
|---|---|
| Product Title (required) | Same |
| Supplier picker, create new from the typed name | Same (search, tap to choose or clear, "Create …") |
| Category picker, create new; choosing a category gives every variant its kitchen printer | Same |
| Description | Same |
| For Sale, Track Stock | Same (switches) |
| Images: upload several, preview, delete, unbind | Same (library or camera, up to 10 at a time) |
| Bind up to 2 pictures to a variant | Same (tap a picture) |
| Configure Options: up to 3 options with values; Generate variants ("A / B"); keeps price, barcode, cost and default of variants that remain | Same. For an existing product options cannot be added or removed and existing values cannot be removed (as on the web) |
| Set price for all variants | Same |
| Per variant: price, discount (amount or %), barcode, low stock, ideal stock, purchase cost | Same |
| Composite toggle (confirmed) with components and quantities | Same (components found with the product search) |
| Visible toggle (confirmed) | Same |
| Menu tags Popular, New, Most Order | Same |
| Kitchen printer per variant (category default or a printer) | Same |
| Delete a variant | Same |
| Variant Conversions (from, rate ≥ 2, to; a pair once, either direction; hidden for movies and for fewer than 2 variants) | Same |
| Movie form for the Movies category: poster, trailer, duration, release date, director, producer share, 10% tax, rating, genres, cast, producer emails, synopsis; one variant only | Same, see differences |
| Only the main branch can add or edit | Same |
| Save disabled until title and a variant exist | Checked when Save is pressed, with a message for what is wrong |

## Product list (`app/products.tsx`, `lib/product-list.ts`)

| Web | Phone |
|---|---|
| Search by title (from 4 characters), by barcode, filter by supplier and category, 30 per page | Same (barcode is a switch next to the search box) |
| Row: image, title, variants, stock ("N/A" with unit conversions), price, category, created, Low Stock badge | Same |
| Variants shown under the row; a barcode search opens them | Same |
| Variant: option values, SKU, Composite badge, stock (red when low), price | Same |
| Variant menu: Transaction, Count, Stock In, Stock Out | Transaction list in a sheet; Count / Stock In / Stock Out open the Stock counting screen with the variant chosen. For a composite variant you choose the component first, as the web's prompt says |
| Variant menu: Set Supplier Price (list, add, change with a scheduled price, delete) | Same |
| Variant menu: Print Label | Same, see differences |
| Branch that follows the main branch: For Sale per product, variant visibility, menu tags | Same (visibility and For Sale are confirmed first) |
| Edit, Delete | Same (Edit for the main branch only) |
| Add Product, Upload Excel (main branch) | Same (`app/product-import.tsx`: Code, Name, Price, Product Group required; RSP, Estimation GP, Stocks, Vendor Name, Cost read) |

## Differences, on purpose or by limit

- **Print Label** opens the phone's print dialog with the label (product, variant, price, discounted price, barcode as text, N copies). The web sends it to the kh-pos print server; a phone cannot reach that, and the barcode is printed as digits, not bars.
- **Trailer upload** is limited to 30 MB on the phone (the web allows 150 MB) because the file is read into memory and sent as text. Longer trailers can be pasted as a link or uploaded from the web.
- **Movie data** is always sent for a movie product. The web only sends it if the movie section was edited, so a movie saved untouched there has no movie row.
- **Discount** may be 0 (as on the web); it may not be negative or above 100%.
- **Excel template download** is not provided; the required columns are listed on the import screen.
- **Count / Stock In / Stock Out** use the phone's own stock screen, not a copy of the web's sheet.
- **Offline:** the list and a product's detail are read from the saved copy; adding, editing, deleting, importing and stock changes need the server.

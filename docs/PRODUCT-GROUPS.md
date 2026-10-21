# Product group: web app vs phone

Checked against the web source (`src/components/gui/product-group/*`, `src/app/api/product-v2/group/*`, `warehouse-visibilty`) on 2026-10-20. The local database has 1 group ("The Floor"). **The screen has not been opened on a phone**, and no save was sent to the server.

Phone: `app/product-groups.tsx`, `lib/product-groups.ts`.

| Web | Phone |
|---|---|
| Warehouse filter (All Warehouses or one branch), 20 per page | Branch chips, loads 20 more at the end |
| List: #, name, description (— when empty), warehouses as badges, product count, created by, created at | Same, as cards |
| Add / Edit / Delete with their permissions; delete asks "Delete Product Group / Are you sure you want to delete this product group?" | Same |
| Form: Group Name (required), Description, Products (search, tags, "N product variants selected"), Warehouses (multi-select, "N warehouses selected"), Create Group / Update Group / Saving... | Same |
| Create: group, products, warehouses, then every product shown (visible + for sale) in every chosen warehouse | Same calls in the same order (`saveSteps`) |
| Edit: update, then added products shown / removed products hidden in the chosen warehouses, then added warehouses get all products shown / removed warehouses get them hidden | Same |
| Delete: the group, then its products hidden in the group's warehouses | Same (`deleteSteps`) |

**Fixed:** the old phone screen saved the group, products and warehouses but never set the product visibility per warehouse, so products added to a group on the phone did not become visible or for sale in the group's branches. It now makes the same visibility calls as the web. Delete also did not hide the products again.

**Differences:** the product picker is the phone's variant search (the web's has a category filter); a product picked on the phone is labelled "Product (Variant)". The old edit-only "remove all" button is gone; delete is on the card.

**Security note (kh-pos):** `GET /api/product-v2/group` returns each creator's whole user record, including their login `token`. The phone keeps only the creator's name in its offline copy. Phones that opened the old screen may still hold the old saved copy under the key `product-groups`. kh-pos should stop sending the token (not changed here).

**Offline:** the list is read from the saved copy; saving and deleting need the server.

# Discounts: web app vs phone

Checked against the web source (`src/components/gui/discount/*`, `src/app/api/discount/*`) on 2026-10-20. The save and "applies" request bodies were parsed with kh-pos's own schemas (valid). **The local database has no discounts**, so the list and the "applies to" rows could not be read from live data; their shape comes from the source. **The screens have not been opened on a phone.**

The web Discount page has two tabs: Discounts and Promotion Sets. On the phone they are two screens with the same two tabs at the top of each (`app/discounts.tsx`, `app/promotion-sets.tsx`).

| Web | Phone |
|---|---|
| List: name, discount (amount with the currency, or %), Applies On, created date, created by, warehouse | Same |
| Applies On: All Products, Specific Variants (n), Specific Products (n), Categories (n) | Same |
| Add Campaign: Campaign Name, type (Percentage % or Fixed Amount), Discount Value, Description | Same. New campaigns start as a fixed amount, like the web |
| The branch of a new campaign is the signed-in user's; an edit keeps the campaign's branch | Same |
| Edit, Delete (asks first) | Same |
| Applies Discount sheet: All Products / Product / Category tabs; switching to or from All Products changes the server | Same |
| Product tab: search and add a product, remove it, applied products with picture; for a product with more than one variant, tick the variants to limit to ("applies to all variants" when none ticked); unticking the last one puts the product back to all variants | Same |
| Category tab: search a category and add it, remove it | Same (tap a category to add) |
| First tab opened: All if applied to all, otherwise Product if there are products, otherwise Category | Same |
| Permissions: create, update, delete on `discount` | Same |

**Differences:** the web does not check the form (an empty name or 0 value is sent); the phone needs a name and a value above 0 (and a percentage of at most 100). Search by name or description is added on the phone.

**Offline:** the list is read from the saved copy; add, edit, delete and applying need the server.

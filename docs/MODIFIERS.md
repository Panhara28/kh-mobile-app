# Modifiers: web app vs phone

Checked against the web source (`src/components/gui/modifier/*`, `src/app/api/modifier/*`) on 2026-10-20. Both modifiers in the local database were loaded and their save request checked against kh-pos's own schema (valid), and the products a modifier applies to were read from the running server. **The screen has not been opened on a phone.**

| Web | Phone (`app/modifiers.tsx`, `lib/modifiers.ts`) |
|---|---|
| List: name, description, number of options (hover shows them), created at, created by | Same (options open under the card) |
| "N modifiers found" | Same |
| Add Modifier (needs create permission) | Same |
| Form: Title (required), Description, Modifier Options with Option Name and Additional Price per option, Add Option, remove an option (only while more than one) | Same, as rows of name and price instead of lines of text (the earlier "Name = price" box is gone) |
| Badges "N options" and "+x max" (the options added together) | Same |
| Save only with a title, at least one option, and every option named | Same; the phone shows what is missing when Save is pressed |
| A price below 0 is ignored | Same |
| Edit (needs update permission) | Same |
| Delete (needs delete permission) | Same, but asks first (the web deletes at once) |
| Applies to Products: search to add a product, list of applied products with picture and variants, remove, filter when there are more than 5, "already has this modifier" | Same (the product is found with the product search) |
| Search | Added on the phone (title, description, option names) |

## A kh-pos bug that is fixed (branch `fix/token-leak-and-modifier-items` in kh-pos)

kh-pos (`src/app/api/modifier/update-modifier.ts`) used to treat an option that arrived with an id as a new one and to save no option that arrived without one: every edit gave every option a new id, and **an option added on the web while editing was silently lost**. The phone worked around it by giving every option an id. The fix (kh-pos commit `dad1bbd`, not pushed or merged): an option with the id of a current option is updated in place, one without an id (or with an id the modifier does not have, which is what the phone sends for an option it added) is added, one left out is removed. Until that branch is running on your server the phone still behaves as before, and after it the phone needs no change.

**Offline:** the list is read from the saved copy; add, edit, delete and applying to products need the server.

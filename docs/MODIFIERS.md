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

## A kh-pos bug the phone works around

When a modifier is **updated**, kh-pos (`src/app/api/modifier/update-modifier.ts`) only saves the options that arrive with an id, and it treats an option that has an id as a new one. On the web form a newly added option has no id, so **an option added while editing is silently lost**. The phone gives every option an id (its own, or a new one for an added option), so nothing is lost. The web page still has the bug; the fix is to swap the two branches in that file. Say if you want me to make that change in kh-pos.

**Offline:** the list is read from the saved copy; add, edit, delete and applying to products need the server.

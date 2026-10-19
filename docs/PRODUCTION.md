# Production: web app vs phone

Checked against the web source (`src/components/gui/production/*`, `src/app/api/composition/*`, `src/app/api/inventory-transactions`) on 2026-10-20. **The screen has not been opened on a phone.** The local database has no composed products and no Compose In transactions, so the picker, the plan and the history list were checked from source only, not against data.

Phone: `app/production.tsx` (list), `ui/production/{produce-form,composite-picker,lot-dialog}.tsx`, `lib/production.ts`.

| Web | Phone |
|---|---|
| Page "Production": top bar with Add (needs create permission on `production`) | Same, "+ Add" in the header |
| List "Production": recent Compose In transactions (product + image, transaction, slot + branch, date, quantity, amount = cost per unit × quantity), paged | Same, as cards, loads more at the end |
| Add Products sheet: product search for composed products only, in this branch | Same (`compositeOnly=true`, `warehouse`) |
| Slot (all slots) | Same, slot chips |
| Quantity; the plan is asked when a product is picked and when leaving the quantity box (blur/Enter) | Same |
| Composition Summary: item count, per component #, Available / Low Stock badge, image, title, variant, price, SKU, "N needed", "unit × qty", "N available", stock slots with LOT (or "⚠ Required" with restrict lot on, N/A otherwise) and quantity | Same |
| Footer: Production Quantity, Max Compositions Possible, "Exceeds available stock" | Same |
| Produce is disabled while saving or loading, without product, quantity above 0, slot, components, or when the quantity exceeds what the stock allows | Same |
| With "restrict product lot" on: a slot without a lot blocks with a message, otherwise the Lot Verification dialog (type/scan each lot id, Verify, `N / M verified`, Confirm Produce only when all are verified) | Same |
| Saves `{composedVariant:{variantId, productLot:{costPerUnit: product price}, qty, slotId}, componentVariants:[{id, stockSlots:[{slotId, qty}]}]}` | Same body |

**Differences:** the old phone screen had lot number / expiry / cost fields and a "Check the recipe" button; they are gone because the web has none (the cost is the product's price, the plan is asked automatically). The web asks about unsaved changes never; the phone's Cancel closes the sheet.

**Offline:** the list is read from the saved copy; producing needs the server.

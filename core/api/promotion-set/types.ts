// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import type { ProductSearchResult } from "../product/search-product/types";
import type { PromotionSetItem } from "../../lib/promotion-set";

/** One promotion-set slot with the menu products that can fill it. */
export interface PromotionSetChoiceSlot {
  item: PromotionSetItem;
  /** Same visibility / pricing rules as the POS menu search. */
  candidates: ProductSearchResult[];
}

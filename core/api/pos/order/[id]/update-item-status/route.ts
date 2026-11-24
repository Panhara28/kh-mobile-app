// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { forceUpdateQtyByStatus } from "./force-update-qty";
import { updateOrderItemStatusAPI } from "./update-order-item-status";

export const POST = updateOrderItemStatusAPI;

export const PUT = forceUpdateQtyByStatus;

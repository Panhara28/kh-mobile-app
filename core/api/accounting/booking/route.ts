// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createBooking } from "./booking-create";
import { deleteBooking } from "./booking-delete";
import { getBookingList } from "./booking-list";

export const POST = createBooking;
export const GET = getBookingList;
export const DELETE = deleteBooking;

// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createShowtime } from "./shotime-create";
import { deleteShowtime } from "./showtime-delete";
import { getShowtimeList } from "./showtime-list";
import { updateShowtime } from "./showtime-update";

export const GET = getShowtimeList;
export const POST = createShowtime;
export const PUT = updateShowtime;
export const DELETE = deleteShowtime;

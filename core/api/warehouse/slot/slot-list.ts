// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SlotDetail, SlotService } from "../../../classes/slot";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSearchSlot = z.object({
  warehouse_id: z.string().nonempty(),
  search_name: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export type InputSearchSlotType = z.infer<typeof inputSearchSlot>;

export const slotList = withAuthApi<
  InputSearchSlotType,
  unknown,
  ResponseType<{ data: SlotDetail[]; total: number }>
>(async ({ db, searchParams }) => {
  const input = inputSearchSlot.parse(searchParams);
  const result = await new SlotService(db).searchSlot({
    warehouseId: input.warehouse_id,
    searchName: input.search_name,
    limit: Number(input.limit) || 30,
    offset: Number(input.offset) || 0,
  });
  return NextResponse.json({ success: true, result }, { status: 200 });
});

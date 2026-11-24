// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const restaurantTableLayoutSchema = z.array(
  z.object({
    id: z.string(),
    positionX: z.string().optional(),
    positionY: z.string().optional(),
  })
);

export type RestaurantTableLayoutUpdate = z.infer<
  typeof restaurantTableLayoutSchema
>;

export const tableLayoutUpdate = withAuthApi(async ({ db, body }) => {
  const input = restaurantTableLayoutSchema.parse(body);

  for (const x of input) {
    const data = {
      position_x: x.positionX || null,
      position_y: x.positionY || null,
    };
    await db.table("restaurant_tables").update(data).where({ id: x.id });
  }

  return NextResponse.json(
    {
      success: true,
      message: "Table layout updated successfully",
    },
    { status: 200 }
  );
});

// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { SetupService, setupStepSchema, type SetupStatus, type SetupStepInput } from "../../classes/setup";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../lib/types";
import { NextResponse } from "../../next-compat/server";

// Reading is open to every staff role (the POS needs to know whether it is locked); changes need "setting".
export const GET = withAuthApi<unknown, unknown, ResponseType<SetupStatus>>(async ({ db, userAuth }) => {
  const service = new SetupService(db, userAuth.admin!.currentWarehouseId!);
  return NextResponse.json({ success: true, result: await service.status() }, { status: 200 });
});

/** Saves one step. */
export const PUT = withAuthApi<unknown, SetupStepInput, ResponseType<SetupStatus>>(async ({ db, body, userAuth }) => {
  const service = new SetupService(db, userAuth.admin!.currentWarehouseId!);
  await service.saveStep(setupStepSchema.parse(body), userAuth.admin!);
  return NextResponse.json({ success: true, result: await service.status() }, { status: 200 });
});

/** Finishes setup and unlocks selling. */
export const POST = withAuthApi<unknown, unknown, ResponseType<SetupStatus>>(async ({ db, userAuth }) => {
  const service = new SetupService(db, userAuth.admin!.currentWarehouseId!);
  await service.complete();
  return NextResponse.json({ success: true, result: await service.status() }, { status: 200 });
});

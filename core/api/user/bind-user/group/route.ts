// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { BindUserService } from "../../../../classes/bind-user";
import withAuthApi from "../../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";

export const GET = withAuthApi<
  unknown,
  unknown,
  ResponseType<number>,
  { userId: string }
>(async ({ db, userAuth, searchParams }) => {
  const bindUserService = new BindUserService(db, userAuth.admin!);

  const group = await bindUserService.getBindUserGroup(
    searchParams?.userId || "",
  );

  return NextResponse.json(
    {
      success: true,
      result: group,
    },
    { status: 200 },
  );
});

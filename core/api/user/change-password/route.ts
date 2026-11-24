// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { AuthenticationUser } from "../../../classes/authentication/user";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { ResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";
import { z } from "zod";

const inputSchemaChanagePassword = z.object({
  oldPassword: z.string(),
  newPassword: z.string(),
});

export const POST = withAuthApi<
  unknown,
  { oldPassword: string; newPassword: string },
  ResponseType<unknown>
>(async ({ db, body, userAuth }) => {
  const input = inputSchemaChanagePassword.parse(body);

  const auth = new AuthenticationUser(db);

  const user = await auth.validatePassword(
    userAuth.admin?.username || "",
    input.oldPassword
  );

  if (!user)
    return NextResponse.json(
      { success: false, error: "Old password is incorrect" },
      { status: 400 }
    );

  const res = await auth.changePassword(userAuth.admin!.id, input.newPassword);

  return NextResponse.json({ success: res }, { status: 200 });
});

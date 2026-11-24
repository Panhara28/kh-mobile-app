// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { MeResponseType } from "../../../lib/types";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<unknown, unknown, MeResponseType>(
  async ({ userAuth }) => {
    if (!userAuth.admin) {
      return NextResponse.json({ error: "No user found" }, { status: 401 });
    }
    return NextResponse.json({ user: userAuth.admin }, { status: 200 });
  }
);

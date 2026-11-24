// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { getSupplierById, Supplier } from "../../../lib/server-functions/supplier";
import withAuthApi from "../../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../../next-compat/server";

export const GET = withAuthApi<{ id: string }, unknown, Supplier | null>(
  async ({ db, params }) => {
    const id = params?.id;

    if (!id) {
      return NextResponse.json(null, { status: 400 });
    }

    const supplier = await getSupplierById({ db, id });

    return NextResponse.json(supplier, {
      status: supplier ? 200 : 404,
    });
  }
);

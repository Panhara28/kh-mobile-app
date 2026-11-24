// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createDb, type Db } from "../../db/db";
import { headers } from "../../next-compat/request-context";
import { NextRequest, NextResponse } from "../../next-compat/server";
import { HttpError } from "./customer-scope";
import { ZodError } from "zod";

export default function withDatabaseApi<ParamType = unknown, InputType = unknown, OutputType = unknown, SearchParamType = unknown>(
  callback: (props: {
    db: Db;
    req: NextRequest;
    body?: InputType;
    params?: ParamType;
    searchParams?: SearchParamType;
  }) => Promise<NextResponse<OutputType>>,
) {
  return async function handler(req: NextRequest, params: { params: Promise<ParamType> }) {
    // One Db per request: loaders created through LoaderFactory are shared (and batched) for the whole request.
    const db = createDb();

    try {
      const headerList = await headers();
      const body = headerList.get("Content-Type") === "application/json" ? await req.json() : undefined;

      // Extract search parameters (last value wins for repeated keys, like Object.fromEntries)
      const searchParams = req.nextUrl.searchParams
        ? (Object.fromEntries(req.nextUrl.searchParams.entries()) as SearchParamType)
        : undefined;

      return await callback({
        db,
        req,
        params: await params.params,
        searchParams,
        body,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
      // Bad input is the caller's mistake, not a server failure.
      if (error instanceof ZodError) {
        const message = error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return NextResponse.json({ success: false, error: message }, { status: 400 });
      }
      console.error("Error in withAuthApi handler:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  };
}

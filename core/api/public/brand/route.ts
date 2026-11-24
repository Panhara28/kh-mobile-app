// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { createDb } from "../../../db/db";
import { NextResponse } from "../../../next-compat/server";

/**
 * Global brand (title / description) for the web app's <head>. Replaces the web layout's direct DB read now that
 * the UI is a separate app. Public: it is what every page already shows in its title.
 */
export async function GET() {
  try {
    const row = await createDb().row("setting", { option: "BRAND", warehouse: null }, { select: ["value"] });
    const brand = JSON.parse(row?.value || "{}");
    return NextResponse.json(
      { title: brand?.title ?? null, description: brand?.description ?? null },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ title: null, description: null });
  }
}

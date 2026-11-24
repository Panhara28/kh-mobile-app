// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { put } from "@vercel/blob";
import withAuthApi from "../../lib/server-functions/with-auth-api";
import { NextResponse } from "../../next-compat/server";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/**
 * Stores an uploaded file (base64 JSON body, same contract as before) in Vercel Blob and returns its public URL.
 * Formerly MinIO. Now requires a signed-in user (the old endpoint let anyone upload or overwrite files).
 */
export const uploadFileMinIO = withAuthApi<unknown, { fileName?: string; fileContent?: string }, unknown>(async ({ body }) => {
  try {
    const { fileName, fileContent } = body ?? {};
    if (!fileName || !fileContent) {
      return NextResponse.json({ error: "fileName and fileContent are required" }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: "Uploads are not configured (BLOB_READ_WRITE_TOKEN)." }, { status: 500 });
    }
    // Keep just the file name (no folders / "..") under images/, the old bucket.
    const safeName = String(fileName).split(/[\/]/).pop()!.replace(/[^\w.\-]/g, "_");
    const extension = safeName.split(".").pop()?.toLowerCase() || "";
    const blob = await put(`images/${safeName}`, Buffer.from(fileContent, "base64"), {
      access: "public",
      contentType: CONTENT_TYPES[extension] || "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
    return NextResponse.json({ url: blob.url }, { status: 200 });
  } catch (e) {
    // Always answer with JSON, so the client can show the reason instead of failing to parse an empty body.
    console.error("Upload failed:", e);
    return NextResponse.json({ error: `Upload failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
});

export async function getFileMinIo() {
  return NextResponse.json({ message: "Hello from Next.js App Router API!" });
}

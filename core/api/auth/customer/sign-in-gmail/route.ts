// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import { Formatter } from "../../../../lib/formatter";
import { generateId, generateUserToken } from "../../../../lib/generate-id";
import { verifyGoogleIdToken } from "../../../../lib/google-id-token";
import { HttpError } from "../../../../lib/server-functions/customer-scope";
import withDatabaseApi from "../../../../lib/server-functions/with-database-api";
import { ResponseType } from "../../../../lib/types";
import { NextResponse } from "../../../../next-compat/server";
import { z } from "zod";

/**
 * The app sends the ID token it received from Google Sign-In. Email, Google account id,
 * name and photo are taken from the verified token, never from the request.
 */
const inputSchema = z.object({
  idToken: z.string().min(1),
  metadata: z.any().optional(),
  platform: z.enum(["web", "ios", "android"]).optional(),
  // customer_token.device_id is NOT NULL; signing in again on a device revokes its old token.
  deviceId: z.string().min(1).max(255),
  lat: z.string().optional(),
  lng: z.string().optional(),
});

type InputType = z.infer<typeof inputSchema>;

export const POST = withDatabaseApi<InputType, ResponseType<unknown>>(
  async ({ db, body }) => {
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Send the Google ID token (idToken) and deviceId");
    }
    const input = parsed.data;
    const google = await verifyGoogleIdToken(input.idToken);

    const res = await db.tx(async (trx) => {
      const existingEmail = await trx.row("customer", { AND: [{ email: google.email }, { email_key: google.sub }] });

      const customerId = existingEmail ? existingEmail.id : generateId();

      if (!existingEmail) {
        await trx.insert("customer", {
          id: customerId,
          email: google.email,
          email_key: google.sub,
          customer_name: google.name,
          photo: google.picture || null,
          created_at: Formatter.getNowDateTime(),
        });
      }

      const token = generateUserToken();

      await trx.update("customer_token", { AND: [{ customer_id: customerId }, { device_id: input.deviceId }] }, {
          is_revoked: true,
          expires_at: Formatter.getNowDateTime(),
        });

      await trx.insert("customer_token", {
        customer_id: customerId,
        device_id: input.deviceId,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // expire in 30 day
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        platform: input.platform || null,
        lat: input.lat || null,
        lng: input.lng || null,
        token,
        token_type: "online",
        created_at: Formatter.getNowDateTime(),
      });

      return token;
    });

    return NextResponse.json(
      { success: true, result: { token: res }, error: "" },
      { status: 200 },
    );
  },
);

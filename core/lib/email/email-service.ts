// @ts-nocheck
// GENERATED from kh-pos-v2 by scripts/sync-core.mjs. Do not edit: change kh-pos-v2, then sync.
import fs from "fs/promises";
import { basename } from "path";
import { env } from "../../config/env";

export interface EmailAttachment {
  filename: string;
  path: string;
}

/**
 * Mailgun API (multipart) over fetch. The old `request` version resolved even when Mailgun answered with an
 * HTTP error, so failed sends were reported as sent and never retried; now a non-2xx response rejects.
 */
async function sendMailgun(email: string, subject: string, body: string, attachments?: EmailAttachment[]): Promise<void> {
  const cfg = env.public.mailServer;
  const form = new FormData();
  form.append("from", cfg.FROM_EMAIL);
  form.append("to", email);
  form.append("subject", subject);
  form.append("html", body);
  for (const att of attachments ?? []) {
    const bytes = await fs.readFile(att.path);
    form.append("attachment", new Blob([bytes]), att.filename || basename(att.path));
  }
  try {
    const res = await fetch(cfg.HOST, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${cfg.USERNAME}:${cfg.PASSWORD}`).toString("base64") },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Mailgun API error ${res.status}: ${text}`);
    console.log("Email sent successfully via Mailgun API");
    console.log("Response:", text);
  } finally {
    for (const att of attachments ?? []) {
      await fs.unlink(att.path).catch((error) => console.error(`Failed to delete attachment ${att.path}:`, error));
    }
  }
}

export class Email {
  /** Send email with attachments using Mailgun API */
  static sendMailgunWithAttachments(email: string, subject: string, body: string, attachments?: EmailAttachment[]): Promise<void> {
    return sendMailgun(email, subject, body, attachments);
  }
}

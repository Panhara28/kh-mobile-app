import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

/**
 * Pictures are kept as data addresses (`data:image/jpeg;base64,...`) inside the change that uses them, so a picture
 * picked with no connection is saved on the phone with that change. When the change is sent, every data address in it
 * is uploaded first and replaced by the address kh-pos gives (see SyncEngine.resolveUploads).
 */

export const isDataImage = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/') && v.includes(';base64,');

/** A picked picture (base64 from the picker) as a value for a form field. */
export function pictureValue(base64: string, extension = 'jpg'): string {
  const mime = extension === 'jpg' ? 'jpeg' : extension;
  return `data:image/${mime};base64,${base64}`;
}

/** The parts of a data address: the file extension and the base64 text. */
export function splitDataImage(value: string): { extension: string; base64: string } {
  const mime = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(value)?.[1]?.toLowerCase() ?? 'jpeg';
  return { extension: mime === 'jpeg' ? 'jpg' : mime.replace('svg+xml', 'svg'), base64: value.slice(value.indexOf(';base64,') + 8) };
}

/** A short name for a picture, to remember what it was uploaded as (the same picture sent twice is uploaded once). */
export const pictureKey = (value: string) => `upload:${bytesToHex(sha256(utf8ToBytes(value)))}`;

export interface UploadMemo {
  get(key: string): Promise<string | null>;
  set(key: string, url: string): Promise<void>;
}

/** Replaces every data address found anywhere in `value` by its uploaded address. */
export async function resolveUploads<T>(value: T, upload: (base64: string, extension: string) => Promise<string>, memo: UploadMemo): Promise<T> {
  if (isDataImage(value)) {
    const key = pictureKey(value);
    const known = await memo.get(key);
    if (known) return known as T;
    const { base64, extension } = splitDataImage(value);
    const url = await upload(base64, extension);
    await memo.set(key, url);
    return url as T;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await resolveUploads(item, upload, memo));
    return out as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await resolveUploads(v, upload, memo);
    return out as T;
  }
  return value;
}

/** True when a data address is anywhere in `value` (so a send can skip the walk for the many changes that have none). */
export function hasDataImage(value: unknown): boolean {
  if (isDataImage(value)) return true;
  if (Array.isArray(value)) return value.some(hasDataImage);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasDataImage);
  return false;
}

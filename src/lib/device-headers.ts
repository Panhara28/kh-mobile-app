/**
 * The device id and name kh-pos logs with every action (X-Device-Id, X-Device-Label). Kept here with
 * no storage code so the API client can read it; lib/device.ts loads it from the phone.
 */
let current: Record<string, string> = {};

export function setDeviceHeaders(id: string, label: string): void {
  current = {};
  if (id) current['X-Device-Id'] = id;
  // URI-encoded so Khmer names stay header-safe, like the web
  if (label.trim()) current['X-Device-Label'] = encodeURIComponent(label.trim().slice(0, 100));
}

export const getDeviceHeaders = (): Record<string, string> => current;

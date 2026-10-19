import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PRINT_URL, deviceLabelOf, normalizePrintUrl, type PrintMethod } from './account';
import { setDeviceHeaders } from './device-headers';

/** Per-phone settings of the web profile menu, kept on this phone only (never sent to the shared settings). */
const K = { id: 'khpos_device_id', label: 'khpos_device_label', url: 'khpos_print_url', method: 'khpos_print_method', printer: 'khpos_printer_name' } as const;

const get = async (k: string) => {
  try {
    return (await SecureStore.getItemAsync(k)) ?? '';
  } catch {
    return '';
  }
};
const put = async (k: string, v: string) => {
  try {
    if (v) await SecureStore.setItemAsync(k, v);
    else await SecureStore.deleteItemAsync(k);
  } catch {
    // storage unavailable: the value stays for this run only
  }
};

export interface DeviceSettings {
  id: string;
  label: string;
  printUrl: string;
  method: PrintMethod;
  printer: string;
}

/** The stable device id (made once) and the saved name; tells the API client to send them. */
export async function loadDevice(): Promise<DeviceSettings> {
  let id = await get(K.id);
  if (!id) {
    id = Crypto.randomUUID();
    await put(K.id, id);
  }
  const label = await get(K.label);
  setDeviceHeaders(id, label);
  const method: PrintMethod = (await get(K.method)) === 'print_server' ? 'print_server' : 'browser';
  return { id, label, printUrl: (await get(K.url)) || DEFAULT_PRINT_URL, method, printer: await get(K.printer) };
}

export async function saveDeviceLabel(id: string, label: string): Promise<string> {
  const l = deviceLabelOf(label);
  await put(K.label, l);
  setDeviceHeaders(id, l);
  return l;
}

export const savePrintUrl = (url: string) => put(K.url, normalizePrintUrl(url));
export const savePrintMethod = (m: PrintMethod) => put(K.method, m);
export const savePrinterName = (n: string) => put(K.printer, n.trim());

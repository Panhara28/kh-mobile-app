import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { deviceLabelOf } from './account';
import { setDeviceHeaders } from './device-headers';

/** Per-phone settings of the web profile menu, kept on this phone only (never sent to the shared settings). */
const K = { id: 'khpos_device_id', label: 'khpos_device_label' } as const;

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
  return { id, label };
}

export async function saveDeviceLabel(id: string, label: string): Promise<string> {
  const l = deviceLabelOf(label);
  await put(K.label, l);
  setDeviceHeaders(id, l);
  return l;
}

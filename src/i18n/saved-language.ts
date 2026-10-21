import * as SecureStore from 'expo-secure-store';
import i18n, { isLanguage, type Language } from './index';

const KEY = 'khpos.language';

/** Uses the language chosen the last time (the app starts in Khmer only the very first time). */
export async function restoreLanguage(): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (isLanguage(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
  } catch {
    // the phone's secure storage is not available: keep the default
  }
}

/** Changes the language and remembers it for the next start. */
export async function chooseLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    await SecureStore.setItemAsync(KEY, language);
  } catch {
    // not remembered, still changed for now
  }
}

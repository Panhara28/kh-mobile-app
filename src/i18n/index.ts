import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import km from './km.json';

export const LANGUAGES = ['km', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const resources = { en: { translation: en }, km: { translation: km } } as const;

/** Khmer first, like the kh-pos web app (its default locale is km). */
export function initI18n(language: Language = 'km'): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false }, // React already escapes
      returnNull: false,
    });
  } else {
    // Live reload during development: load the latest texts (otherwise new keys show as
    // "cart.summary"), and keep the language the user picked.
    for (const [lng, bundle] of Object.entries(resources)) {
      i18n.addResourceBundle(lng, 'translation', bundle.translation, true, true);
    }
    void i18n.changeLanguage(i18n.language);
  }
  return i18n;
}

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

export default i18n;

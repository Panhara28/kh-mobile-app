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
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
}

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

export default i18n;

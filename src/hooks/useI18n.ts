import { create } from "zustand";
import {
  detectLocale,
  isLocale,
  setLocale as setLogicLocale,
  translate,
  type Locale,
  type TParams,
  type TranslationKey,
} from "@logic/i18n";

const LS_LOCALE_KEY = "sam.locale";

const getInitialLocale = (): Locale => {
  const stored = localStorage.getItem(LS_LOCALE_KEY);
  if (isLocale(stored)) return stored;
  return detectLocale();
};

const makeT =
  (locale: Locale) =>
  (key: TranslationKey, params?: TParams): string =>
    translate(locale, key, params);

const initialLocale = getInitialLocale();

setLogicLocale(initialLocale);
document.documentElement.lang = initialLocale;

const localeStore = create<{
  locale: Locale;
  t: (key: TranslationKey, params?: TParams) => string;
  setLocale: (locale: Locale) => void;
}>((set) => ({
  locale: initialLocale,
  t: makeT(initialLocale),
  setLocale: (locale: Locale) => {
    localStorage.setItem(LS_LOCALE_KEY, locale);
    setLogicLocale(locale);
    document.documentElement.lang = locale;
    set({ locale, t: makeT(locale) });
  },
}));

export default localeStore;

import { vi } from "../locales/vi";
import { en } from "../locales/en";

export type Locale = "vi" | "en";
export type TranslationKey = keyof typeof vi;
export type TParams = Record<string, string | number>;

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
];

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  vi,
  en,
};

let currentLocale: Locale = "vi";

const interpolate = (template: string, params?: TParams): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
};

export const translate = (
  locale: Locale,
  key: TranslationKey,
  params?: TParams,
): string => {
  const dictionary = dictionaries[locale] ?? dictionaries.vi;
  const template = dictionary[key] ?? dictionaries.vi[key] ?? key;
  return interpolate(template, params);
};

export const setLocale = (locale: Locale): void => {
  currentLocale = locale;
};

export const getLocale = (): Locale => currentLocale;

export const t = (key: TranslationKey, params?: TParams): string =>
  translate(currentLocale, key, params);

export const isLocale = (value: unknown): value is Locale =>
  value === "vi" || value === "en";

export const detectLocale = (): Locale => {
  if (typeof navigator === "undefined") return "vi";
  const languages =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  const normalized = languages.filter(Boolean).map((lang) => lang.toLowerCase());
  if (normalized.some((lang) => lang.startsWith("vi"))) return "vi";
  if (normalized.some((lang) => lang.startsWith("en"))) return "en";
  return "vi";
};

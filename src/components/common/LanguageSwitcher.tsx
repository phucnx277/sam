import useI18n from "@hooks/useI18n";
import { LOCALES, type Locale } from "@logic/i18n";

const LanguageSwitcher = () => {
  const locale = useI18n((state) => state.locale);
  const t = useI18n((state) => state.t);
  const setLocale = useI18n((state) => state.setLocale);

  return (
    <select
      className="text-xs border border-gray-400 rounded-sm bg-white px-1 py-0.5"
      value={locale}
      aria-label={t("common.language")}
      onChange={(event) => setLocale(event.target.value as Locale)}
    >
      {LOCALES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;

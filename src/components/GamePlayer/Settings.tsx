import useI18n from "@hooks/useI18n";
import LanguageSwitcher from "../common/LanguageSwitcher";

const Settings = ({ onClose }: { onClose: () => void }) => {
  const { t } = useI18n();

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-6 rounded-lg shadow-2xl shadow-gray-400 w-[24rem] max-w-[92%] gap-y-4">
        <div className="text-center text-lg font-semibold">
          {t("settings.title")}
        </div>
        <div className="flex items-center justify-between gap-x-2">
          <span>{t("common.language")}</span>
          <LanguageSwitcher />
        </div>
        <div className="flex justify-center mt-8">
          <button
            type="button"
            className="w-[8rem] !px-0 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;

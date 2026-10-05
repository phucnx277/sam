import useI18n from "@hooks/useI18n";

const LoadingOverlay = () => {
  const { t } = useI18n();

  return (
    <div className="fixed z-20 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-y-3 backdrop-blur-sm bg-black/10">
      <div className="size-10 rounded-full border-4 border-gray-300 border-t-cyan-600 animate-spin" />
      <span className="text-gray-700">{t("lobby.connecting")}</span>
    </div>
  );
};

export default LoadingOverlay;

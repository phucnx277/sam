import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { exportPlayerInfo } from "@logic/player";

const WelcomePlayer = () => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const handleLogOut = () => {
    const cf = window.confirm(t("confirm.logout"));
    if (cf) {
      localStorage.clear();
      window.location.href = window.location.origin;
    }
  };

  const copyPlayerPattern = async () => {
    if (!localPlayer) return;
    const content = exportPlayerInfo(localPlayer);
    try {
      await navigator.clipboard.writeText(content);
      alert(t("player.infoCopied"));
    } catch {
      /* empty */
    }
  };

  return (
    <div className="flex items-center justify-start text-xl gap-1">
      <span>{t("player.welcome")}</span>
      <span className="cursor-pointer" onClick={copyPlayerPattern}>
        <span className="font-semibold">{localPlayer!.name}</span>!
      </span>
      <button
        className="ml-4 text-sm rounded-sm !px-2 !py-0 border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
        onClick={handleLogOut}
      >
        {t("player.logout")}
      </button>
    </div>
  );
};

export default WelcomePlayer;

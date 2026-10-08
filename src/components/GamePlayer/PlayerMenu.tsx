import { useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import TableInfo from "../Tables/TableInfo";
import ShareTable from "../Tables/ShareTable";
import HowToPlay from "./HowToPlay";
import TableChat from "./TableChat";
import Settings from "./Settings";

type MenuActionKey = "info" | "share" | "howToPlay" | "chat" | "settings";

const PlayerMenu = () => {
  const { t } = useI18n();
  const { playingTable } = useAppData();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [shouldShowTableInfo, setShouldShowTableInfo] = useState(false);
  const [shouldShowShareTable, setShouldShowShareTable] = useState(false);
  const [shouldShowHowToPlay, setShouldShowHowToPlay] = useState(false);
  const [shouldShowChat, setShouldShowChat] = useState(false);
  const [shouldShowSettings, setShouldShowSettings] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const actions: { key: MenuActionKey; emoji: string; label: string }[] = [
    { key: "info", emoji: "ℹ️", label: t("game.tableInfo") },
    { key: "share", emoji: "🔗", label: t("table.share") },
    { key: "chat", emoji: "💬", label: t("chat.open") },
    { key: "howToPlay", emoji: "🙋‍♂️", label: t("howToPlay.title") },
    { key: "settings", emoji: "⚙️", label: t("settings.title") },
  ];

  const selectAction = (key: MenuActionKey) => {
    setIsMenuOpen(false);
    switch (key) {
      case "info":
        setShouldShowTableInfo(true);
        break;
      case "share":
        setShouldShowShareTable(true);
        break;
      case "howToPlay":
        setShouldShowHowToPlay(true);
        break;
      case "chat":
        setShouldShowChat(true);
        break;
      case "settings":
        setShouldShowSettings(true);
        break;
    }
  };

  return (
    <div className="relative flex w-10 shrink-0 items-start justify-center mt-1">
      {isMenuOpen && (
        <div
          aria-hidden="true"
          className="fixed z-[4] top-0 right-0 bottom-0 left-0 backdrop-blur-[2px]"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {isMenuOpen && (
        <div
          id="player-menu"
          className="absolute z-[6] bottom-full w-max right-0 mb-1 flex flex-col gap-y-2 bg-white p-3 rounded-lg shadow-2xl shadow-gray-400"
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="!px-2 !py-0 flex items-center gap-x-1 whitespace-nowrap rounded-sm text-left hover:bg-cyan-100 active:bg-cyan-100 focus:bg-cyan-100"
              onClick={() => selectAction(action.key)}
            >
              <span>{action.emoji}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="!p-0 z-5 flex items-center justify-center size-8 rounded-full bg-cyan-600 text-white text-lg shadow-lg shadow-gray-400/50"
        title={t("game.menu")}
        aria-label={t("game.menu")}
        aria-controls="player-menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((prev) => !prev)}
      >
        {isMenuOpen ? "×" : "☰"}
      </button>

      {shouldShowTableInfo && (
        <TableInfo onClose={() => setShouldShowTableInfo(false)} />
      )}
      {shouldShowShareTable && (
        <ShareTable
          table={playingTable!}
          onClose={() => setShouldShowShareTable(false)}
        />
      )}
      {shouldShowHowToPlay && (
        <HowToPlay onClose={() => setShouldShowHowToPlay(false)} />
      )}
      {shouldShowSettings && (
        <Settings onClose={() => setShouldShowSettings(false)} />
      )}
      <TableChat
        isOpen={shouldShowChat}
        onOpen={() => setShouldShowChat(true)}
        onClose={() => setShouldShowChat(false)}
      />
    </div>
  );
};

export default PlayerMenu;

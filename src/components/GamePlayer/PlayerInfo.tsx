import { memo, useEffect, useState } from "react";
import useI18n from "@hooks/useI18n";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { isGameInProgress } from "@logic/game";

const PlayerInfo = memo(
  ({
    isMe,
    gamePlayer,
    isWinner,
    reorderDisabled,
    onCardReorderingChange,
  }: {
    isMe: boolean;
    gamePlayer: GamePlayer;
    isWinner?: boolean;
    reorderDisabled: boolean;
    onCardReorderingChange: () => void;
  }) => {
    const { t } = useI18n();
    const { playingTable, dispatchAction } = useAppData();
    const { localPlayer } = useLocalPlayer();
    const canRemove =
      !isMe &&
      playingTable!.hostId === localPlayer!.id &&
      !!gamePlayer.isDisconnected &&
      isGameInProgress(playingTable!.game);
    return (
      <div className={`flex items-center`}>
        {isMe && gamePlayer.cards.length > 0 && (
          <div className="flex-1">
            <button
              className={`!p-0 flex items-center`}
              onClick={onCardReorderingChange}
            >
              <input
                name="cardReorderingCheck"
                type="checkbox"
                checked={!!reorderDisabled}
                readOnly={true}
              />
              <span className="ml-1 text-sm">{t("game.cardsSorted")}</span>
            </button>
          </div>
        )}

        <div className="flex-2 flex justify-center items-center gap-x-2 sm:leading-4 md:text-lg lg:text-xl">
          <div className="flex items-center justify-center gap-x-2">
            {isWinner && <span className="text-sm lg:text-lg">👑</span>}
            {!isMe && (
              <input
                type="checkbox"
                checked={!!gamePlayer.isReady}
                name="gpIsReady"
                readOnly={true}
              />
            )}
            <span>{gamePlayer.name}</span>
            {!isMe && gamePlayer.isDisconnected && (
              <span className="ml-1 text-[0.65rem] px-1 rounded-sm bg-gray-300 text-gray-700">
                {t("game.disconnected")}
              </span>
            )}
            {canRemove && (
              <button
                type="button"
                className="ml-1 text-[0.65rem] px-1 rounded-sm bg-red-500 text-white"
                onClick={() =>
                  dispatchAction("removeDisconnected", {
                    removingPlayerId: gamePlayer.id,
                    actingPlayerId: localPlayer!.id,
                  })
                }
              >
                {t("action.removeDisconnected")}
              </button>
            )}
            {!isMe && gamePlayer.isAway && !gamePlayer.isDisconnected && (
              <span className="ml-1 text-[0.65rem] px-1 rounded-sm bg-amber-200 text-amber-900">
                {t("game.watching")}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-x-2">
            {gamePlayer.starOfHope && (
              <span className="text-sm lg:text-lg">⭐</span>
            )}
            <ChipCount chipCount={gamePlayer.chipCount} />
            {gamePlayer.lastAction === "tiger" && (
              <img alt="tiger" className="size-6 pb-0.5" src="/logo.svg" />
            )}
          </div>
        </div>

        {isMe && gamePlayer.cards.length > 0 && <div className="flex-1"></div>}
      </div>
    );
  },
);

const ChipCount = memo(({ chipCount }: { chipCount: number }) => {
  const [chip, setChip] = useState(chipCount);

  useEffect(() => {
    const iid = setInterval(() => {
      setChip((prev) => {
        if (prev === chipCount) {
          clearInterval(iid);
          return prev;
        }
        return chipCount > prev ? prev + 1 : prev - 1;
      });
    }, 75);
    return () => {
      clearInterval(iid);
    };
  }, [chipCount]);

  return (
    <div
      className={`flex items-center gap-x-1 font-semibold ${chipCount >= 0 ? `text-green-500` : "text-red-500"}`}
    >
      <span className="text-2xl leading-5">⛁</span>
      <span>{chip}</span>
    </div>
  );
});

export default PlayerInfo;

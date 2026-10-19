import { memo, useEffect, useState } from "react";
import type { TranslationKey } from "@logic/i18n";
import useAppData from "@hooks/useAppData";
import useCurrency from "@hooks/useCurrency";
import useI18n from "@hooks/useI18n";

const PhomWinLabelKey: Record<
  Exclude<PhomWinType, "points" | null>,
  TranslationKey
> = {
  u: "game.u",
  uTron: "game.uTron",
  uKhan: "game.uKhan",
  uDen: "game.uDen",
};

const PlayerInfo = memo(
  ({
    isMe,
    gamePlayer,
    isWinner,
  }: {
    isMe: boolean;
    gamePlayer: GamePlayer;
    isWinner?: boolean;
  }) => {
    const { playingTable } = useAppData();
    const { t } = useI18n();
    const phomEnded =
      playingTable?.gameType === "phom" &&
      playingTable.game.state === "ended";
    const phomWinType =
      phomEnded &&
      playingTable.game.winnerId === gamePlayer.id &&
      playingTable.game.phomWinType &&
      playingTable.game.phomWinType !== "points"
        ? playingTable.game.phomWinType
        : null;

    return (
      <div className={`flex items-center`}>
        {isMe && gamePlayer.cards.length > 0 && <div className="flex-1" />}

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
          </div>
          <div className="flex items-center justify-center gap-x-2">
            {gamePlayer.starOfHope && (
              <span className="text-sm lg:text-lg">⭐</span>
            )}
            <ChipCount chipCount={gamePlayer.chipCount} />
            {gamePlayer.lastAction === "tiger" && (
              <img alt="tiger" className="size-6 pb-0.5" src="/logo.svg" />
            )}
            {phomEnded &&
              (phomWinType ? (
                <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-amber-100 text-amber-800 border border-amber-400">
                  {t(PhomWinLabelKey[phomWinType])}
                </span>
              ) : gamePlayer.isMom ? (
                <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-red-100 text-red-700 border border-red-400">
                  {t("game.mom")}
                </span>
              ) : gamePlayer.score !== undefined ? (
                <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-sky-100 text-sky-800 border border-sky-400">
                  {t("game.points", { points: gamePlayer.score })}
                </span>
              ) : null)}
          </div>
        </div>

        {isMe && gamePlayer.cards.length > 0 && <div className="flex-1"></div>}
      </div>
    );
  },
);

const ChipCount = memo(({ chipCount }: { chipCount: number }) => {
  const { currency } = useCurrency();
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
      {currency && <span className="text-lg leading-5">{currency}</span>}
      <span>{chip}</span>
    </div>
  );
});

export default PlayerInfo;

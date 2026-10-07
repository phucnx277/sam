import { memo, useEffect, useState } from "react";
import useI18n from "@hooks/useI18n";

const PlayerInfo = memo(
  ({
    isMe,
    gamePlayer,
    isWinner,
    locked,
    isHolding,
  }: {
    isMe: boolean;
    gamePlayer: GamePlayer;
    isWinner?: boolean;
    locked: boolean;
    isHolding: boolean;
  }) => {
    const { t } = useI18n();
    const lockLabel = locked ? t("game.cardsLocked") : t("game.cardsUnlocked");
    return (
      <div className={`flex items-center`}>
        {isMe && gamePlayer.cards.length > 0 && (
          <div className="flex-1">
            <span
              className="relative inline-flex size-6 items-center justify-center select-none"
              title={lockLabel}
              aria-label={lockLabel}
              role="img"
            >
              {isHolding && (
                <svg
                  className="absolute inset-0 -rotate-90"
                  viewBox="0 0 30 30"
                  aria-hidden="true"
                >
                  <circle
                    cx="15"
                    cy="15"
                    r="14"
                    fill="none"
                    stroke="#bae6fd"
                    strokeWidth="2"
                  />
                  <circle
                    className="hold-ring"
                    cx="15"
                    cy="15"
                    r="14"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <span className="leading-none">
                {locked ? "🔒" : "🔓"}
              </span>
            </span>
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

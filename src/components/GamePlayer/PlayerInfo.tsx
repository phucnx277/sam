import { memo, useEffect, useState } from "react";

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
              <span className="ml-1 text-sm">Xếp bài xong</span>
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
          </div>
          <div className="flex items-center justify-center gap-x-2">
            {gamePlayer.starOfHope && (
              <span className="text-sm lg:text-lg">⭐</span>
            )}
            <ChipCount chipCount={gamePlayer.chipCount} />{" "}
            {gamePlayer.lastAction === "tiger" && (
              <span className="text-sm lg:text-lg">🐆</span>
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

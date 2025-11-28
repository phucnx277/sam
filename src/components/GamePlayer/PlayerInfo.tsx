import { memo } from "react";

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
    return (
      <div
        className={`flex justify-center items-center gap-x-2 sm:leading-4 md:text-lg lg:text-xl`}
      >
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
          <div
            className={`flex items-center gap-x-1 font-semibold ${gamePlayer.chipCount >= 0 ? `text-green-500` : "text-red-500"}`}
          >
            <span className="text-2xl leading-5">⛁</span>
            <span>{gamePlayer.chipCount}</span>
          </div>
          {gamePlayer.lastAction === "tiger" && (
            <span className="text-sm lg:text-lg">🐆</span>
          )}
        </div>
      </div>
    );
  },
);

export default PlayerInfo;

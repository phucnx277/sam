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

const PokerHandLabelKey: Record<PokerHandCategory, TranslationKey> = {
  highCard: "poker.hand.highCard",
  onePair: "poker.hand.onePair",
  twoPair: "poker.hand.twoPair",
  threeOfAKind: "poker.hand.threeOfAKind",
  straight: "poker.hand.straight",
  flush: "poker.hand.flush",
  fullHouse: "poker.hand.fullHouse",
  fourOfAKind: "poker.hand.fourOfAKind",
  straightFlush: "poker.hand.straightFlush",
  royalFlush: "poker.hand.royalFlush",
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
    const isPoker = playingTable?.gameType === "poker";
    const pokerActiveOrEnded =
      isPoker &&
      (playingTable.game.state === "playing" ||
        playingTable.game.state === "ended");

    return (
      <div className={`flex items-center`}>
        {isMe && gamePlayer.cards.length > 0 && <div className="flex-1" />}

        <div className="flex-2 flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 sm:leading-4 md:text-lg lg:text-xl">
          <div className="flex items-center justify-center gap-x-1.5">
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
            {pokerActiveOrEnded && playingTable.game.dealerId === gamePlayer.id && (
              <span className="px-1 py-0.5 text-xs font-bold rounded-full bg-amber-400 text-gray-900 leading-none">
                {t("game.dealer")}
              </span>
            )}
            {pokerActiveOrEnded &&
              playingTable.game.smallBlindId === gamePlayer.id && (
                <span className="px-1 py-0.5 text-xs font-semibold rounded-sm bg-sky-200 text-sky-900 leading-none">
                  {t("game.sb")}
                </span>
              )}
            {pokerActiveOrEnded &&
              playingTable.game.bigBlindId === gamePlayer.id && (
                <span className="px-1 py-0.5 text-xs font-semibold rounded-sm bg-indigo-200 text-indigo-900 leading-none">
                  {t("game.bb")}
                </span>
              )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
            {gamePlayer.starOfHope && (
              <span className="text-sm lg:text-lg">⭐</span>
            )}
            {!isPoker && <ChipCount chipCount={gamePlayer.chipCount} />}
            {isPoker && (
              <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-amber-50 text-amber-900 border border-amber-400">
                {t("game.stack")}{" "}
                {gamePlayer.stack ?? (playingTable.buyIn ?? 1000)}
              </span>
            )}
            {isPoker && playingTable.game.state === "playing" && (
              <>
                {gamePlayer.foldedHand ? (
                  <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-gray-200 text-gray-700 border border-gray-400">
                    {t("game.folded")}
                  </span>
                ) : gamePlayer.allIn ? (
                  <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-rose-600 text-white">
                    {t("game.allIn")}
                  </span>
                ) : null}
                {(gamePlayer.streetBet ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-emerald-100 text-emerald-800 border border-emerald-400">
                    {t("game.bet")} {gamePlayer.streetBet}
                  </span>
                )}
              </>
            )}
            {isPoker && playingTable.game.state === "ended" && (
              <>
                {gamePlayer.foldedHand ? (
                  <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-gray-200 text-gray-700 border border-gray-400">
                    {t("game.folded")}
                  </span>
                ) : gamePlayer.pokerHandRank ? (
                  <span className="px-1.5 py-0.5 text-xs font-semibold rounded-sm bg-purple-100 text-purple-900 border border-purple-400">
                    {t(PokerHandLabelKey[gamePlayer.pokerHandRank])}
                  </span>
                ) : null}
                {(gamePlayer.handWonChips ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold rounded-sm bg-green-100 text-green-800 border border-green-500">
                    {t("game.wonChips", { chips: gamePlayer.handWonChips! })}
                  </span>
                )}
              </>
            )}
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

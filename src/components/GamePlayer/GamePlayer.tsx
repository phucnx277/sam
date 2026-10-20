/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { areCardsEqual, getSortedCards } from "@logic/card";
import { findTigerAndKiller, isPlayerPassedTurn } from "@logic/game";
import { getSortedPhomCards } from "@logic/phom";
import { chatMessageText } from "@logic/chat";
import useLocalGame from "@hooks/useLocalGame";
import useChat from "@hooks/useChat";
import useI18n from "@hooks/useI18n";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useIsMobile from "@hooks/useIsMobile";
import useOrientation from "@hooks/useOrientation";
import useLongPress from "@hooks/useLongPress";
import Cards from "../Cards/Cards";
import Actions from "./Actions";
import PlayerInfo from "./PlayerInfo";
import PlayerMenu from "./PlayerMenu";

const GamePlayer = ({
  gamePlayer,
  onAction,
}: {
  gamePlayer: GamePlayer;
  onAction?: (table: Table) => Promise<void>;
}) => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { localGame, setLocalGame, localCards, setLocalCards } = useLocalGame();
  const { playingTable } = useAppData();
  const bubble = useChat((s) => s.bubbles[gamePlayer.id]);
  const openChat = useChat((s) => s.open);
  const isMobile = useIsMobile();
  const orientation = useOrientation();

  const [{ tiger, tigerKiller }, setTigers] = useState<{
    tiger?: GamePlayer | null;
    tigerKiller?: GamePlayer | null;
  }>({ tiger: null, tigerKiller: null });
  const [sortingLocked, setSortingLocked] = useState(false);

  const {
    isHolding,
    handlers: holdHandlers,
    consumeLongPress,
  } = useLongPress({
    onLongPress: () => setSortingLocked((prev) => !prev),
  });

  const isMe = localPlayer!.id === gamePlayer.id;
  const isPoker = playingTable?.gameType === "poker";
  const lockLabel = sortingLocked
    ? t("game.cardsLocked")
    : t("game.cardsUnlocked");

  const selectCard = (card: Card) => {
    if (!isMe) return;
    setLocalCards((prev) =>
      isPoker
        ? (prev || []).map((item) =>
            areCardsEqual(item, card)
              ? { ...item, folded: !item.folded, selected: false }
              : { ...item, selected: false },
          )
        : handleCardSelect(prev || [], card),
    );
  };

  const sortLocalCards = (descending: boolean) => {
    if (!isMe || !localGame || sortingLocked || isPoker) return;
    const sorted =
      playingTable?.gameType === "phom"
        ? getSortedPhomCards(localCards, descending)
        : getSortedCards(localCards, descending);
    setLocalCards(sorted);
  };

  const unfoldLocalCards = (folded: boolean) => {
    setLocalCards(localCards.map((item) => ({ ...item, folded })));
  };

  const reorderCards = (currentIndex: number, newIndex: number) => {
    if (newIndex < currentIndex) {
      newIndex++;
    }
    const newCards = [...localCards];
    const movedCard = newCards.splice(currentIndex, 1)[0];
    newCards.splice(newIndex, 0, { ...movedCard, selected: false });

    setLocalCards(newCards);
  };

  useEffect(() => {
    if (!isMe || !playingTable!.game) return;
    setLocalGame({
      playerId: localPlayer!.id,
      gameId: playingTable!.game.id,
      cards: localCards,
    });
  }, [localCards]);

  useEffect(() => {
    if (!isMe) {
      return;
    }
    if (
      !localGame ||
      localGame.gameId !== playingTable!.game?.id ||
      localGame.playerId !== localPlayer?.id ||
      !localGame.cards.length
    ) {
      setLocalCards(
        gamePlayer.cards.map((c) => ({
          ...c,
          folded: c.folded === undefined || c.folded === null ? true : c.folded,
        })),
      );
      return;
    }

    const kept = localGame.cards.filter((item) =>
      gamePlayer.cards.some((gpc) => areCardsEqual(item, gpc)),
    );
    const added = gamePlayer.cards
      .filter((gpc) => !kept.some((item) => areCardsEqual(item, gpc)))
      .map((c) => ({
        ...c,
        folded: false,
        selected: false,
      }));
    setLocalCards([...kept, ...added]);
  }, [gamePlayer.cards]);

  useEffect(() => {
    if (playingTable!.game.state !== "ended") {
      setTigers({ tiger: null, tigerKiller: null });
      if (playingTable!.game.state === "handChecking") {
        setSortingLocked(false);
      } else if (playingTable!.game.state === "playing") {
        setSortingLocked((playingTable!.gameType || "sam") === "sam");
      }
      return;
    }
    setTigers(findTigerAndKiller(playingTable!.game));
  }, [playingTable!.game!.state]);

  const backToLobby = () => {
    const confirmLeave = window.confirm(t("confirm.leaveTable"));
    if (confirmLeave) {
      const url = new URL(window.location.href);
      url.searchParams.delete("tblId");
      url.searchParams.delete("tblPw");
      window.location.href = url.toString();
    }
  };

  const swipeHandlers = useSwipeable({
    onSwiped: (event) => {
      let left = "Left";
      let right = "Right";
      let up = "Up";
      let down = "Down";
      if (isMobile && orientation === "portrait") {
        left = "Up";
        right = "Down";
        up = "Right";
        down = "Left";
      }
      switch (event.dir) {
        case left:
          unfoldLocalCards(true);
          break;
        case right:
          unfoldLocalCards(false);
          break;
        case up:
          sortLocalCards(false);
          break;
        case down:
          sortLocalCards(true);
          break;
      }
    },
    trackMouse: true,
    preventScrollOnSwipe: true,
  });

  return (
    <div
      className={`relative flex gap-x-2 p-2 w-full rounded-sm ${gamePlayer.isReady || isMe ? "opacity-100" : "opacity-50"} ${playingTable!.game?.currentPlayerId === gamePlayer.id ? "bg-yellow-300/30" : ""}`}
    >
      {!isMe &&
        playingTable!.game.state === "playing" &&
        (playingTable!.gameType === "poker"
          ? !!gamePlayer.foldedHand
          : isPlayerPassedTurn(playingTable!.game, gamePlayer)) && (
          <div className="absolute z-10 inset-0 flex items-center justify-center">
            <div className="flex items-center gap-x-1 rounded-sm border-2 border-red-500 bg-red-50/60 px-2 py-0.5 mt-6 font-semibold text-red-600">
              <span className="text-2xl lg:text-4xl">🚫</span>
              <span className="text-base lg:text-2xl">
                {playingTable!.gameType === "poker"
                  ? t("game.folded")
                  : t("game.turnPassed")}
              </span>
            </div>
          </div>
        )}

      <div
        className={`w-full flex flex-1 gap-y-1 lg:gap-y-2 ${isMe ? "flex-col-reverse" : "flex-col"}`}
      >
        <PlayerInfo
          gamePlayer={gamePlayer}
          isMe={isMe}
          isWinner={
            playingTable!.lastGame?.winnerId === gamePlayer.id ||
            (playingTable!.lastGame?.winnerIds ?? []).includes(gamePlayer.id)
          }
        />
        {playingTable!.gameType === "phom" &&
          ((gamePlayer.discards?.length ?? 0) > 0 ||
            (gamePlayer.eatenCards?.length ?? 0) > 0 ||
            (gamePlayer.melds?.length ?? 0) > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
              {(gamePlayer.discards?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-600 font-medium">
                    {t("game.discards")}:
                  </span>
                  <div className="flex items-center gap-0.5">
                    {gamePlayer.discards!.map((c, idx) =>
                      renderMiniCard(c, idx, "border-gray-300"),
                    )}
                  </div>
                </div>
              )}
              {(gamePlayer.eatenCards?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-amber-700 font-medium">
                    {t("game.eaten")}:
                  </span>
                  <div className="flex items-center gap-0.5">
                    {gamePlayer.eatenCards!.map((c, idx) =>
                      renderMiniCard(c, idx, "border-amber-500 bg-amber-50"),
                    )}
                  </div>
                </div>
              )}
              {(gamePlayer.melds?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-green-700 font-medium">
                    {t("game.melds")}:
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {gamePlayer.melds!.map((meld, mIdx) => (
                      <div
                        key={mIdx}
                        className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-50 border border-green-500"
                      >
                        {meld.map((c, cIdx) =>
                          renderMiniCard(c, cIdx, "border-green-300"),
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        <div className="relative flex flex-1 w-full gap-x-2">
          {isMe && (
            <div className="flex w-8 shrink-0 flex-col items-center justify-between">
              <button className="!p-0 text-xl" onClick={backToLobby}>
                🔙
              </button>
              {!isPoker && gamePlayer.cards.length > 0 && (
                <button
                  className="!p-0 relative inline-flex size-7 items-center justify-center select-none text-sky-700"
                  title={lockLabel}
                  aria-label={lockLabel}
                  onClick={() => setSortingLocked((v) => !v)}
                >
                  {isHolding && (
                    <svg
                      className="absolute -top-1 -left-1 size-9 -rotate-90"
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
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    {sortingLocked ? (
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    ) : (
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    )}
                  </svg>
                </button>
              )}
            </div>
          )}
          <div
            {...(isMe && localCards.length > 0
              ? {
                  ...swipeHandlers,
                  ...(isPoker ? {} : holdHandlers),
                }
              : {})}
            onContextMenu={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              if (!isPoker && consumeLongPress()) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            className="relative flex flex-1 w-full swipeable select-none [-webkit-touch-callout:none]"
          >
            <div
              className={`flex flex-1 w-full ${playingTable!.game.state === "ended" ? "opacity-40" : ""}`}
            >
              <Cards
                isMe={isMe}
                cards={
                  isMe
                    ? localCards
                    : gamePlayer.cards.map((c) => ({
                        ...c,
                        folded:
                          playingTable!.gameType === "phom" &&
                          (gamePlayer.eatenCards ?? []).some((ec) =>
                            areCardsEqual(ec, c),
                          )
                            ? false
                            : c.folded === undefined || c.folded === null
                              ? true
                              : c.folded,
                        selected: false,
                      }))
                }
                onCardSelect={selectCard}
                onReorder={reorderCards}
                reorderDisabled={!isMe || sortingLocked || isPoker}
                gamePlayer={
                  (playingTable!.gameType || "sam") === "sam"
                    ? gamePlayer
                    : undefined
                }
              />
            </div>

            {playingTable!.game.state === "ended" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-x-1 text-3xl lg:text-6xl">
                {(playingTable!.game?.winnerId === gamePlayer.id ||
                  (playingTable!.game?.winnerIds ?? []).includes(
                    gamePlayer.id,
                  )) && <span>👑</span>}
                {playingTable!.game?.winnerId === gamePlayer.id &&
                  gamePlayer.id === tiger?.id && (
                    <span>
                      <img
                        alt="tiger"
                        className="size-10 pb-0.5 lg:size-22 lg:pb-1"
                        src="/logo.svg"
                      />
                    </span>
                  )}
                {(gamePlayer.id === tigerKiller?.id ||
                  (gamePlayer.id === tiger?.id &&
                    gamePlayer.id !== playingTable!.game?.winnerId)) && (
                  <span className="relative">
                    <span>
                      <img
                        alt="tiger"
                        className="size-10 pb-0.5 lg:size-22 lg:pb-1"
                        src="/logo.svg"
                      />
                    </span>
                    <span className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center">
                      🔪
                    </span>
                  </span>
                )}
                {gamePlayer.paidVillage && <span>🐷</span>}
              </div>
            )}
          </div>
          {isMe && isPoker && onAction && (
            <div className="flex flex-1 items-center justify-end">
              <Actions
                selectedCards={
                  localCards.filter((item) => item.selected) || []
                }
                gamePlayer={gamePlayer}
                onAction={onAction}
              />
            </div>
          )}
          {!isMe && bubble && (
            <button
              type="button"
              onClick={openChat}
              className="absolute inset-0 z-20 flex items-center justify-center"
            >
              <span className="chat-bubble flex flex-col gap-y-0.5 max-w-[16rem] bg-gray-800/90 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg text-left">
                {bubble.messages.map((message) => (
                  <span key={message.id} className="break-words line-clamp-3">
                    <span className="font-semibold">{message.name}</span>
                    {": "}
                    {chatMessageText(message)}
                  </span>
                ))}
              </span>
            </button>
          )}
          {isMe && <PlayerMenu />}
        </div>
      </div>
    </div>
  );
};

const RankLabel: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

const SuitSymbol: Record<Suit, string> = {
  S: "♠",
  C: "♣",
  D: "♦",
  H: "♥",
};

const renderMiniCard = (
  card: Card,
  key: number | string,
  extraClass = "",
) => {
  const rankText = RankLabel[card.rank] ?? String(card.rank);
  const suitText = SuitSymbol[card.suit];
  const colorClass =
    card.suit === "H" || card.suit === "D" ? "text-red-600" : "text-gray-900";
  return (
    <span
      key={key}
      className={`inline-flex items-center px-1 py-0.5 text-xs font-semibold leading-none rounded bg-white border ${colorClass} ${extraClass}`}
    >
      {rankText}
      {suitText}
    </span>
  );
};

const handleCardSelect = (prev: Card[], card: Card) => {
  return prev.map((item) => {
    let value: Card;
    if (!areCardsEqual(item, card)) {
      value = { ...item };
    } else {
      value = {
        ...item,
        folded: false,
        selected: item.folded ? false : !item.selected,
      };
    }
    return value;
  });
};

export default GamePlayer;

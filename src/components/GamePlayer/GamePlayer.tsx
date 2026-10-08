/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { areCardsEqual, getSortedCards } from "@logic/card";
import { findTigerAndKiller, isPlayerPassedTurn } from "@logic/game";
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
import PlayerInfo from "./PlayerInfo";
import PlayerMenu from "./PlayerMenu";

const GamePlayer = ({ gamePlayer }: { gamePlayer: GamePlayer }) => {
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
  const lockLabel = sortingLocked
    ? t("game.cardsLocked")
    : t("game.cardsUnlocked");

  const selectCard = (card: Card) => {
    if (!isMe) return;
    setLocalCards((prev) => handleCardSelect(prev || [], card));
  };

  const sortLocalCards = (descending: boolean) => {
    if (!isMe || !localGame || sortingLocked) return;
    setLocalCards(getSortedCards(localCards, descending));
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

    setLocalCards(
      localGame.cards.filter((item) =>
        gamePlayer.cards.some((gpc) => areCardsEqual(item, gpc)),
      ),
    );
  }, [gamePlayer.cards]);

  useEffect(() => {
    if (playingTable!.game.state !== "ended") {
      setTigers({ tiger: null, tigerKiller: null });
      if (playingTable!.game.state === "handChecking") {
        setSortingLocked(false);
      } else if (playingTable!.game.state === "playing") {
        setSortingLocked(true);
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
        playingTable!.game.state == "playing" &&
        isPlayerPassedTurn(playingTable!.game, gamePlayer) && (
          <div className="absolute z-10 inset-0 flex items-center justify-center">
            <div className="flex items-center gap-x-1 rounded-sm border-2 border-red-500 bg-red-50/60 px-2 py-0.5 mt-6 font-semibold text-red-600">
              <span className="text-2xl lg:text-4xl">🚫</span>
              <span className="text-base lg:text-2xl">
                {t("game.turnPassed")}
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
          isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
        />
        <div className="relative flex flex-1 w-full gap-x-2">
          {isMe && (
            <div className="flex w-8 shrink-0 flex-col items-center justify-between">
              <button className="!p-0 text-xl" onClick={backToLobby}>
                🔙
              </button>
              {gamePlayer.cards.length > 0 && (
                <button
                  className="!p-0 relative inline-flex size-7 items-center justify-center select-none text-xl"
                  title={lockLabel}
                  aria-label={lockLabel}
                  onClick={() => setSortingLocked((v) => !v)}
                >
                  {isHolding && (
                    <svg
                      className="absolute -inset-1 -rotate-90"
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
                  <span className="leading-none text-2xl">
                    {sortingLocked ? "🔒" : "🔓"}
                  </span>
                </button>
              )}
            </div>
          )}
          <div
            {...(isMe && localCards.length > 0
              ? { ...swipeHandlers, ...holdHandlers }
              : {})}
            onContextMenu={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              if (consumeLongPress()) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            className={`flex flex-1 w-full swipeable select-none [-webkit-touch-callout:none] ${playingTable!.game.state === "ended" ? "opacity-40" : ""}`}
          >
            <Cards
              isMe={isMe}
              cards={
                isMe
                  ? localCards
                  : gamePlayer.cards.map((c) => ({
                      ...c,
                      folded:
                        c.folded === undefined || c.folded === null
                          ? true
                          : c.folded,
                      selected: false,
                    }))
              }
              onCardSelect={selectCard}
              onReorder={reorderCards}
              reorderDisabled={!isMe || sortingLocked}
              gamePlayer={gamePlayer}
            />
          </div>
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

          {playingTable!.game.state === "ended" && (
            <div className="absolute top-0 right-10 bottom-0 left-10 flex flex-1 items-center justify-center gap-x-1 text-3xl lg:text-6xl">
              {playingTable!.game?.winnerId === gamePlayer.id && (
                <span>👑</span>
              )}
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
      </div>
    </div>
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

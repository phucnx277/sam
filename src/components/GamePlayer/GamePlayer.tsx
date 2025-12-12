/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { areCardsEqual, getSortedCards } from "@logic/card";
import { findTigerAndKiller, isPlayerPassedTurn } from "@logic/game";
import useLocalGame from "@hooks/useLocalGame";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useIsMobile from "@hooks/useIsMobile";
import useOrientation from "@hooks/useOrientation";
import Cards from "../Cards/Cards";
import PlayerInfo from "./PlayerInfo";
import TableInfo from "../Tables/TableInfo";

const GamePlayer = ({ gamePlayer }: { gamePlayer: GamePlayer }) => {
  const { localPlayer } = useLocalPlayer();
  const { localGame, setLocalGame, localCards, setLocalCards } = useLocalGame();
  const { playingTable } = useAppData();
  const isMobile = useIsMobile();
  const orientation = useOrientation();

  const [shouldShowTableInfo, setShouldShowTableInfo] = useState(false);
  const [{ tiger, tigerKiller }, setTigers] = useState<{
    tiger?: GamePlayer | null;
    tigerKiller?: GamePlayer | null;
  }>({ tiger: null, tigerKiller: null });
  const [reoderDisabled, setReorderDisabled] = useState(false);

  const isMe = localPlayer!.id === gamePlayer.id;

  const selectCard = (card: Card) => {
    if (!isMe) return;
    setLocalCards((prev) => handleCardSelect(prev || [], card));
  };

  const sortLocalCards = (descending: boolean) => {
    if (!isMe || !localGame || reoderDisabled) return;
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
        setReorderDisabled(false);
      } else if (playingTable!.game.state === "playing") {
        setReorderDisabled(true);
      }
      return;
    }
    setTigers(findTigerAndKiller(playingTable!.game));
  }, [playingTable!.game!.state]);

  const backToLobby = () => {
    const confirmLeave = window.confirm("Rời bàn?");
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
          <div className="flex items-center justify-center rounded-sm absolute z-10 top-0 left-0 bottom-0 right-0 text-4xl lg:text-7xl bg-gray-300/30">
            🚫
          </div>
        )}

      <div
        className={`w-full flex flex-1 gap-y-1 lg:gap-y-2 ${isMe ? "flex-col-reverse" : "flex-col"}`}
      >
        <PlayerInfo
          gamePlayer={gamePlayer}
          isMe={isMe}
          isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
          reorderDisabled={reoderDisabled}
          onCardReorderingChange={() => setReorderDisabled((prev) => !prev)}
        />
        <div className={`relative flex flex-1 w-full gap-x-2`}>
          {isMe && (
            <div>
              <button className="!p-0" onClick={backToLobby}>
                ⬅️
              </button>
            </div>
          )}
          <div
            {...(isMe && localCards.length > 0 ? swipeHandlers : {})}
            className={`flex flex-1 w-full swipeable ${playingTable!.game.state === "ended" ? "opacity-40" : ""}`}
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
              reorderDisabled={!isMe || reoderDisabled}
              gamePlayer={gamePlayer}
            />
          </div>
          {isMe && (
            <div>
              <button
                className="!p-0"
                onClick={() => setShouldShowTableInfo(true)}
              >
                ℹ️
              </button>
              {shouldShowTableInfo && (
                <TableInfo onClose={() => setShouldShowTableInfo(false)} />
              )}
            </div>
          )}

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

import { memo, useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { areCardsEqual, getSortedCards } from "@logic/card";
import { findTigerAndKiller } from "@logic/game";
import useLocalGame from "@hooks/useLocalGame";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useIsMobile from "@hooks/useIsMobile";
import useOrientation from "@hooks/useOrientation";
import Cards from "../Cards/Cards";

const GamePlayer = ({ gamePlayer }: { gamePlayer: GamePlayer }) => {
  const { localPlayer } = useLocalPlayer();
  const { localGame, setLocalGame, localCards, setLocalCards } = useLocalGame();
  const { playingTable, leaveTable, getApiKey } = useAppData();
  const isMobile = useIsMobile();
  const orientation = useOrientation();

  const [{ tiger, tigerKiller }, setTigers] = useState<{
    tiger?: GamePlayer | null;
    tigerKiller?: GamePlayer | null;
  }>({ tiger: null, tigerKiller: null });

  const isMe = localPlayer!.id === gamePlayer.id;

  useEffect(() => {
    if (!isMe || !playingTable!.game) return;
    setLocalGame({
      playerId: localPlayer!.id,
      gameId: playingTable!.game.id,
      cards: localCards,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePlayer.cards]);

  useEffect(() => {
    if (playingTable!.game.state !== "ended") {
      setTigers({ tiger: null, tigerKiller: null });
      return;
    }
    setTigers(findTigerAndKiller(playingTable!.game));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable!.game!.state]);

  const selectCard = (card: Card) => {
    if (!isMe) return;
    setLocalCards((prev) => handleCardSelect(prev || [], card));
  };

  const sortLocalCards = (descending: boolean) => {
    if (!isMe || !localGame) return;
    setLocalCards(getSortedCards(localCards, descending));
  };

  const unfoldLocalCards = (folded: boolean) => {
    setLocalCards(localCards.map((item) => ({ ...item, folded })));
  };

  const handleTableAction = (action: "lobby" | "share") => {
    switch (action) {
      case "lobby": {
        const confirmLeave = window.confirm("Rời bàn?");
        if (confirmLeave) {
          leaveTable();
        }
        break;
      }
      case "share": {
        if (!navigator.clipboard) {
          break;
        }
        const tableUrl = `${window.location.href}?apiKey=${getApiKey("encoded")}&tblId=${playingTable!.id}&tblPw=${playingTable!.password}`;
        navigator.clipboard
          .writeText(tableUrl)
          .then(() => {
            alert("Link copied!");
          })
          .catch((e) => {
            alert(e);
          });
        break;
      }
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
      className={`flex gap-x-2 p-2 w-full rounded-sm ${gamePlayer.isReady || isMe ? "opacity-100" : "opacity-50"} ${playingTable!.game?.currentPlayerId === gamePlayer.id ? "bg-yellow-300/30" : ""}`}
    >
      <div
        className={`w-full flex flex-1 gap-y-1 lg:gap-y-2 ${isMe ? "flex-col-reverse" : "flex-col"}`}
      >
        <PlayerInfo
          gamePlayer={gamePlayer}
          isMe={isMe}
          isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
        />
        <div className={`relative flex flex-1 w-full gap-x-2`}>
          {isMe && (
            <div>
              <button
                className="!p-0"
                onClick={() => handleTableAction("lobby")}
              >
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
              gamePlayer={gamePlayer}
            />
          </div>
          {isMe && (
            <div>
              <button
                className="!p-0"
                onClick={() => handleTableAction("share")}
              >
                ℹ️
              </button>
            </div>
          )}

          {playingTable!.game.state === "ended" && (
            <div className="absolute top-0 right-10 bottom-0 left-10 flex flex-1 items-center justify-center gap-x-1 text-3xl lg:text-6xl">
              {playingTable!.game?.winnerId === gamePlayer.id && (
                <span>👑</span>
              )}
              {playingTable!.game?.winnerId === gamePlayer.id &&
                gamePlayer.id === tiger?.id && <span>🐆</span>}
              {(gamePlayer.id === tigerKiller?.id ||
                (gamePlayer.id === tiger?.id &&
                  gamePlayer.id !== playingTable!.game?.winnerId)) && (
                <span className="relative">
                  <span>🐆</span>
                  <span className="absolute top-0 right-0 bottom-0 left-0">
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

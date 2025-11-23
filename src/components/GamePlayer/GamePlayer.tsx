import { memo, useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { areCardsIdentical, getSortedCards } from "@logic/card";
import { findTigerAndKiller } from "@logic/game";
import useLocalGame from "@hooks/useLocalGame";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import Cards from "../Cards/Cards";
import Actions from "./Actions";

const GamePlayer = ({ gamePlayer }: { gamePlayer: GamePlayer }) => {
  const { localPlayer } = useLocalPlayer();
  const { localGame, setLocalGame } = useLocalGame();
  const { playingTable, updateTable, leaveTable, getApiKey } = useAppData();
  const [localCards, setLocalCards] = useState<Card[]>([]);
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
    if (
      !isMe ||
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
        gamePlayer.cards.some((gpc) => areCardsIdentical(item, gpc)),
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

  const handleAction = async (table: Table) => {
    const error = await updateTable(table);
    if (error) {
      alert(error.message);
    }
  };

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
        const tableUrl = `${window.location.href}?apiKey=${getApiKey()}&tblId=${playingTable!.id}&tblPw=${playingTable!.password}`;
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

  // TODO: check iOS landscape workaround
  const swipeHandlers = useSwipeable({
    onSwiped: (event) => {
      switch (event.dir) {
        case "Left":
          unfoldLocalCards(true);
          break;
        case "Right":
          unfoldLocalCards(false);
          break;
        case "Up":
          sortLocalCards(false);
          break;
        case "Down":
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
      {isMe && (
        <div className="flex flex-col w-[8rem]">
          <PlayerInfo
            gamePlayer={gamePlayer}
            isMe={true}
            isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
            onAction={handleTableAction}
          />
        </div>
      )}
      <div className={`flex flex-col flex-1 w-full gap-y-1 relative`}>
        {!isMe && (
          <PlayerInfo
            gamePlayer={gamePlayer}
            isMe={false}
            isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
          />
        )}
        {localCards.length > 0 &&
          playingTable!.game?.winnerId !== gamePlayer.id && (
            <div
              {...(isMe ? swipeHandlers : {})}
              className={`flex flex-1 w-full swipeable ${playingTable!.game.state === "ended" ? "opacity-30" : ""}`}
            >
              <Cards
                isMe={isMe}
                cards={localCards}
                onCardSelect={selectCard}
                gamePlayer={gamePlayer}
              />
            </div>
          )}
        {playingTable!.game.state === "ended" && (
          <div className="absolute top-0 right-0 bottom-0 left-0 flex flex-1 items-center justify-center gap-x-1 text-3xl lg:text-6xl">
            {playingTable!.game?.winnerId === gamePlayer.id && <span>👑</span>}
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
          </div>
        )}
      </div>
      {isMe && playingTable && (
        <Actions
          selectedCards={localCards.filter((item) => item.selected) || []}
          gamePlayer={gamePlayer}
          onAction={handleAction}
        />
      )}
    </div>
  );
};

const PlayerInfo = memo(
  ({
    isMe,
    gamePlayer,
    isWinner,
    onAction,
  }: {
    isMe: boolean;
    gamePlayer: GamePlayer;
    isWinner?: boolean;
    onAction?: (action: "lobby" | "share") => void;
  }) => {
    return (
      <div
        className={`flex justify-center gap-x-2 gap-y-1 ${isMe ? "flex-col" : "items-center"}`}
      >
        <div className="flex items-center justify-center gap-x-1">
          {isWinner && <span>👑</span>}
          {!isMe && (
            <input
              type="checkbox"
              checked={!!gamePlayer.isReady}
              name="gpIsReady"
              readOnly={true}
            />
          )}
          <span className="lg:text-lg">{gamePlayer.name}</span>
        </div>
        <div className="flex items-center justify-center gap-x-2">
          {gamePlayer.starOfHope && <span>⭐</span>}
          <div
            className={`flex items-center gap-x-1 font-semibold text-lg lg:text-xl ${gamePlayer.chipCount >= 0 ? `text-green-500` : "text-red-500"}`}
          >
            <span>⛁</span>
            <span>{gamePlayer.chipCount}</span>
          </div>
          {gamePlayer.lastAction === "tiger" && (
            <span className="text-lg lg:text-xl">🐆</span>
          )}
        </div>
        {isMe && (
          <div className="flex mt-1 gap-x-2 text-sm">
            <button
              className="flex-1 text-center !p-1 border rounded-sm border-green-500 bg-cyan-50"
              onClick={() => onAction?.("lobby")}
            >
              Lobby
            </button>
            <button
              className="flex-1 text-center !p-1 rounded-sm bg-green-600"
              onClick={() => onAction?.("share")}
            >
              Share
            </button>
          </div>
        )}
      </div>
    );
  },
);

const handleCardSelect = (prev: Card[], card: Card) => {
  return prev.map((item) => {
    let value: Card;
    if (!areCardsIdentical(item, card)) {
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

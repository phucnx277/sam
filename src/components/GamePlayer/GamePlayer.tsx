import { useEffect, useState } from "react";
import { areCardsIdentical, sortCards } from "@logic/card";
import useLocalGame from "@hooks/useLocalGame";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import Cards from "../Cards/Cards";
import Actions from "./Actions";
import { findTigerAndKiller } from "@logic/game";

const GamePlayer = ({ gamePlayer }: { gamePlayer: GamePlayer }) => {
  const { localPlayer } = useLocalPlayer();
  const { localGame, setLocalGame } = useLocalGame();
  const { playingTable, updateTable } = useAppData();
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

  const sortLocalCards = () => {
    if (!isMe || !localGame) return;
    setLocalCards(sortCards(localCards));
  };

  const unfoldLocalCards = () => {
    setLocalCards(
      localCards.map((item) => ({ ...item, folded: !item.folded })),
    );
  };

  const updateLocalCards = (orderedCards: Card[]) => {
    setLocalCards(orderedCards);
  };

  return (
    <div
      className={`flex gap-x-4 p-2 w-full rounded-sm ${gamePlayer.isReady || isMe ? "opacity-100" : "opacity-50"} ${playingTable!.game?.currentPlayerId === gamePlayer.id ? "bg-green-300/30" : ""}`}
    >
      {isMe && (
        <div className="flex flex-col w-[8rem]">
          <PlayerInfo
            gamePlayer={gamePlayer}
            gameState={playingTable!.game.state}
            isMe={true}
            isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
            onCardsSort={sortLocalCards}
            onUnfoldCards={unfoldLocalCards}
          />
        </div>
      )}
      <div className={`flex flex-col flex-1 gap-y-1`}>
        {!isMe && (
          <PlayerInfo
            gamePlayer={gamePlayer}
            gameState={playingTable!.game.state}
            isMe={false}
            isWinner={playingTable!.lastGame?.winnerId === gamePlayer.id}
          />
        )}
        <div className="flex flex-1 relative">
          {localCards.length > 0 &&
            playingTable!.game?.winnerId !== gamePlayer.id && (
              <div
                className={`flex flex-1 w-full ${playingTable!.game.state === "ended" ? "opacity-20" : ""}`}
              >
                <Cards
                  isMe={isMe}
                  cards={localCards}
                  onCardSelect={selectCard}
                  onReorder={updateLocalCards}
                />
              </div>
            )}
          {playingTable!.game.state === "ended" && (
            <div className="absolute top-0 right-0 bottom-0 left-0 flex flex-1 items-center justify-center gap-x-1 text-3xl lg:text-6xl">
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
            </div>
          )}
        </div>
      </div>
      {isMe && (
        <div className="flex">
          <Actions
            gamePlayer={gamePlayer}
            selectedCards={localCards.filter((item) => item.selected) || []}
            playingTable={playingTable!}
            onAction={handleAction}
          />
        </div>
      )}
    </div>
  );
};

const PlayerInfo = ({
  isMe,
  gamePlayer,
  gameState,
  isWinner,
  onCardsSort,
  onUnfoldCards,
}: {
  isMe: boolean;
  gamePlayer: GamePlayer;
  gameState: GameState;
  isWinner?: boolean;
  onCardsSort?: () => void;
  onUnfoldCards?: () => void;
}) => {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${isMe ? "flex-col" : ""}`}
    >
      <div className="flex items-center gap-x-1">
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
      <div className="flex items-center justify-beetween gap-x-2">
        <div
          className={`font-semibold sm:text-lg lg:text-xl ${gamePlayer.chipCount >= 0 ? `text-green-500` : "text-red-500"}`}
        >
          ⛁ {gamePlayer.chipCount}
        </div>
        {gamePlayer.starOfHope && <span>⭐</span>}
        {isWinner && <span>👑</span>}
      </div>
      {isMe &&
        ["playing", "handChecking"].includes(gameState) &&
        gamePlayer.isReady && (
          <div className="flex flex-col gap-y-2 mt-4">
            <button
              className="p-0 flex justify-center bg-green-600"
              onClick={onCardsSort}
              disabled={gamePlayer.cards.length < 2}
            >
              {"Sắp xếp"}
            </button>
            <button
              className="p-0 flex justify-center bg-green-600"
              onClick={onUnfoldCards}
            >
              {"Lật/Úp"}
            </button>
          </div>
        )}
    </div>
  );
};

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

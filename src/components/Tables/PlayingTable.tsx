import { useEffect } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { divideGamePlayers } from "@logic/player";
import GamePlayer from "../GamePlayer/GamePlayer";
import Cards from "../Cards/Cards";

const PlayingTable = () => {
  const { playingTable } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const { targetGamePlayer, opponents } = divideGamePlayers(
    playingTable!.game.players,
    localPlayer!.id,
  );

  const prevPlayer = playingTable!.game.players.find(
    (item) =>
      item.id === playingTable!.game?.playHistory.slice(-1)[0]?.playerId,
  );

  const curPlayer = playingTable!.game.players.find(
    (item) => item.id === playingTable!.game.currentPlayerId,
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tableId", playingTable!.id);
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable!.id]);

  return (
    <div className="sm:p-4 lg:p-12 fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-y-1 bg-cyan-50">
      <div className="w-full flex flex-1 justify-around sm:gap-x-8 lg:gap-x-20">
        {opponents.map((gp) => (
          <GamePlayer key={gp.id} gamePlayer={gp} />
        ))}
      </div>
      <div className="w-full flex flex-1 justify-between">
        <div className="w-full flex justify-between py-2 lg:py-4">
          <div className="w-full gap-x-1 flex justify-between px-1 py-1 lg:py-2 rounded-sm border-1 border-gray-400">
            <div className="flex flex-col w-[8rem] border-r border-r-gray-400">
              {playingTable!.bo > 0 && (
                <div className="text-center">
                  BO: <strong>{playingTable!.bo}</strong>
                </div>
              )}
              <div className="flex flex-1 flex-col items-center justify-center ">
                <div className="text-sm">Lượt trước</div>
                <div className="font-semibold">{prevPlayer?.name || "--"}</div>
              </div>
              {playingTable!.bo > 0 && (
                <div style={{ height: "1.5rem", width: "1rem" }}></div>
              )}
            </div>
            <div className="flex-1 relative">
              {playingTable!.game.playHistory.slice(-2).map((play, idx) => (
                <div
                  className="absolute flex top-0 left-0 bottom-0 right-0 bg-cyan-50/90"
                  key={idx}
                >
                  <Cards
                    cards={play.cards.map((item) => ({
                      ...item,
                      folded: false,
                      selected: false,
                    }))}
                    onCardSelect={() => {}}
                    isMe={false}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col w-[8rem] items-center justify-center border-l border-l-gray-400">
              <div className="text-sm">Lượt hiện tại</div>
              <div className="font-semibold">{curPlayer?.name}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full flex flex-1 justify-center pt-2 lg:pt-4">
        <GamePlayer key={targetGamePlayer.id} gamePlayer={targetGamePlayer} />
      </div>
    </div>
  );
};

export default PlayingTable;

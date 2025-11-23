import "./PlayingTable.css";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { divideGamePlayers } from "@logic/player";
import useCountDown from "@hooks/useCountDown";
import GamePlayer from "../GamePlayer/GamePlayer";
import Cards from "../Cards/Cards";
import AutoFadeout from "../common/AutoFadeout";
import { isGameInProgress } from "@logic/game";

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

  return (
    <div className="playing-table p-2 lg:p-12 fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-y-1 bg-cyan-50">
      <div className="w-full flex flex-1 justify-around sm:gap-x-8 lg:gap-x-20">
        {opponents.map((gp) => (
          <GamePlayer key={gp.id} gamePlayer={gp} />
        ))}
      </div>
      <div className="w-full flex flex-1 justify-between">
        <div className="w-full flex justify-between">
          <div className="w-full gap-x-1 flex justify-between px-1 py-1 lg:py-2 rounded-sm border-1 border-gray-400">
            <div className="flex flex-col w-[8rem] border-r border-r-gray-400">
              <div className="flex flex-1 flex-col items-center pt-1 gap-1">
                <div className="text-sm">Lượt trước</div>
                <div className="font-semibold">{prevPlayer?.name || "--"}</div>
              </div>
              {playingTable!.bo > 0 && (
                <div className="flex items-center justify-center gap-x-1">
                  <span>BO:</span>
                  <strong className="text-green-600">{playingTable!.bo}</strong>
                </div>
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
              {playingTable!.game.currentPlayerId === localPlayer?.id &&
                isGameInProgress(playingTable!.game) && (
                  <AutoFadeout ts={playingTable!.game.turnStartTs}>
                    <span className="text-5xl lg:text-9xl text-red-600 font-semibold">
                      Your turn!
                    </span>
                  </AutoFadeout>
                )}
            </div>
            <div className="flex flex-col w-[8rem] border-l border-l-gray-400">
              <div className="flex flex-col items-center pt-1 gap-1">
                <div className="text-sm">Lượt hiện tại</div>
                <div className="font-semibold">{curPlayer?.name || "--"}</div>
              </div>
              <div className="flex flex-1 items-center justify-center text-4xl lg:text-7xl text-red-600">
                {(playingTable!.game.state === "handChecking" ||
                  playingTable!.game.state === "playing") &&
                  playingTable!.turnTimeout > 0 && (
                    <TurnTimeRemaining ts={playingTable!.game?.turnEndTs} />
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full flex flex-1 justify-center">
        <GamePlayer key={targetGamePlayer.id} gamePlayer={targetGamePlayer} />
      </div>
    </div>
  );
};

function TurnTimeRemaining({ ts }: { ts: number }) {
  const ds = useCountDown(ts);
  return <span>{ds}</span>;
}

export default PlayingTable;

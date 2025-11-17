import { memo, useEffect } from "react";
import {
  ActionDef,
  findNextAutoPlayer,
  getAutoPlayCards,
  getCurrentPossibleActions,
  isGameInProgress,
} from "@logic/game";
import useCountDown from "@hooks/useCountDown";
import { calDurationSec } from "@logic/util";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";

const Actions = memo(
  ({
    selectedCards,
    gamePlayer,
    onAction,
  }: {
    selectedCards: Card[];
    gamePlayer: GamePlayer;
    onAction: (table: Table) => Promise<void>;
  }) => {
    const { playingTable } = useAppData();
    const { localPlayer } = useLocalPlayer();
    const ds = useCountDown(playingTable!.game.turnEndTs);
    const handleAutoAction = () => {
      const curPlayer = playingTable!.game.players.find(
        (item) => item.id === playingTable!.game.currentPlayerId,
      );
      const possibleActions = getCurrentPossibleActions(
        playingTable!,
        curPlayer!,
      );
      if (!possibleActions.length) return;
      const autoAction = possibleActions[0];
      let autoCards: Card[] = [];
      if (autoAction === "play") {
        autoCards = getAutoPlayCards(curPlayer!.cards);
      }
      const def = ActionDef[autoAction];
      onAction(
        def.handleAction(playingTable!, {
          ...curPlayer!,
          selectedCards: autoCards,
        }),
      );
    };

    const handleAutoActionWrapper = (): NodeJS.Timeout => {
      const iid = setInterval(() => {
        if (!isGameInProgress(playingTable!.game)) {
          clearInterval(iid);
        }
        const secPassed =
          Math.abs(calDurationSec(playingTable!.game.turnEndTs)) %
          (playingTable!.game.players.filter((gp) => gp.isReady).length - 1);
        const nextPlayer = findNextAutoPlayer(playingTable!.game, secPassed);
        if (nextPlayer.id === localPlayer!.id) {
          handleAutoAction();
        }
      }, 1000);
      return iid;
    };

    useEffect(() => {
      if (ds === 0 && isGameInProgress(playingTable!.game)) {
        const tid = handleAutoActionWrapper();
        return () => {
          clearInterval(tid);
        };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ds]);
    return (
      <div className="flex flex-col w-[8rem] gap-y-1">
        {Object.keys(ActionDef).map((action) => (
          <Action
            key={action}
            action={action as PlayerAction}
            playingTable={playingTable!}
            gamePlayer={gamePlayer!}
            selectedCards={selectedCards}
            onAction={onAction}
          />
        ))}
      </div>
    );
  },
);

const Action = memo(
  ({
    action,
    selectedCards,
    playingTable,
    gamePlayer,
    onAction,
  }: {
    action: PlayerAction;
    selectedCards: Card[];
    gamePlayer: GamePlayer;
    playingTable: Table;
    onAction: (table: Table) => Promise<void>;
  }) => {
    const gpWithCards = { ...gamePlayer, selectedCards };
    const def = ActionDef[action];
    const { visible, disabled, value } = def.checkState(
      playingTable!,
      gpWithCards,
    );
    const handleAction = () => {
      return onAction(def.handleAction(playingTable!, gpWithCards));
    };

    return (
      <>
        {visible && (
          <>
            {def.type === "button" && (
              <button
                className={`!px-0 bg-green-600 ${def.className || ""}`}
                disabled={disabled}
                onClick={handleAction}
              >
                {def.label}
              </button>
            )}
            {def.type === "checkbox" && (
              <button
                className={`!p-0 flex items-center ${def.className || ""}`}
                disabled={disabled}
                onClick={handleAction}
              >
                <input
                  name="meIsReady"
                  type="checkbox"
                  checked={!!value}
                  readOnly={true}
                />
                <span className="ml-1">{def.label}</span>
              </button>
            )}
          </>
        )}
      </>
    );
  },
);

export default Actions;

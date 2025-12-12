import { memo, useEffect, type ReactNode } from "react";
import {
  ActionDef,
  findNextAutoPlayer,
  getAutoPlayCards,
  getCurrentPossibleActions,
  isGameInProgress,
} from "@logic/game";
import { checkWhiteTiger, WhiteTigerRankName } from "@logic/hand";
import useCountDown from "@hooks/useCountDown";
import { calDurationSec } from "@logic/util";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import TwoStepButton from "../common/TwoStepButton";

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
      if (!isGameInProgress(playingTable!.game)) {
        return;
      }
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
          return;
        }
        const secPassed =
          Math.abs(calDurationSec(playingTable!.game.turnEndTs)) %
          playingTable!.game.players.filter((gp) => gp.isReady).length;
        const nextPlayer = findNextAutoPlayer(playingTable!.game, secPassed);
        if (nextPlayer.id === localPlayer!.id) {
          handleAutoAction();
        }
      }, 1000);
      return iid;
    };

    const renderTwoStepButtonActions = (actions: PlayerAction[]) => {
      return actions
        .map((action) => {
          const def = ActionDef[action as PlayerAction];
          const { visible, disabled } = def.checkState(playingTable!, {
            ...gamePlayer,
            selectedCards,
          });

          if (!visible || disabled) {
            return null;
          }

          return (
            <TwoStepButton
              key={action}
              className="flex w-1/2 lg:w-1/4 !min-w-[8rem] !max-w[12rem] py-1 border-2 rounded-sm font-semibold"
              activeClassName={def.activeClassName}
              inactiveClassName={def.inactiveClassName}
              onConfirm={() =>
                onAction(
                  def.handleAction(playingTable!, {
                    ...gamePlayer,
                    selectedCards,
                  }),
                )
              }
            >
              <Action
                className="w-full !px-0"
                action={action as PlayerAction}
                disabled={false}
                label={renderLabel(action)}
              />
            </TwoStepButton>
          );
        })
        .filter(Boolean);
    };

    const renderActions = (actions: PlayerAction[]) => {
      return actions
        .map((action) => {
          const def = ActionDef[action as PlayerAction];
          const { visible, disabled, value } = def.checkState(playingTable!, {
            ...gamePlayer,
            selectedCards,
          });

          if (!visible) return null;

          return (
            <Action
              className="!px-0 w-full bg-green-600 font-semibold"
              key={action}
              action={action as PlayerAction}
              disabled={disabled}
              value={value}
              label={renderLabel(action)}
              onAction={() =>
                onAction(def.handleAction(playingTable!, gamePlayer))
              }
            />
          );
        })
        .filter(Boolean);
    };

    const renderLabel = (action: PlayerAction): ReactNode => {
      const def = ActionDef[action as PlayerAction];
      let label = def.label;
      if (action !== "tiger") {
        return label;
      }

      const whiteTiger = checkWhiteTiger(gamePlayer.cards);
      if (whiteTiger > 0) {
        label = WhiteTigerRankName[whiteTiger];
      }

      return (
        <span className="flex justify-center items-center gap-1">
          <span>{label}</span>
          <img className="size-7 pb-1" src="/logo.svg" alt="tiger" />
        </span>
      );
    };

    useEffect(() => {
      if (
        playingTable!.turnTimeout > 0 &&
        ds === 0 &&
        isGameInProgress(playingTable!.game)
      ) {
        const tid = handleAutoActionWrapper();
        return () => {
          clearInterval(tid);
        };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ds]);

    return (
      <>
        {isGameInProgress(playingTable!.game) && (
          <div className="w-full flex items-center">
            <div className="flex-1 flex justify-start">
              {renderTwoStepButtonActions(["pass", "ask"])}
            </div>
            <div className="flex-1 flex justify-end">
              {renderTwoStepButtonActions(["play", "tiger"])}
            </div>
          </div>
        )}

        {!isGameInProgress(playingTable!.game) && (
          <div className="w-full flex items-center justify-center gap-8 bg-cyan-50/60">
            {playingTable!.game.state === "waiting" && (
              <div className="flex flex-col gap-4 min-w-[8rem]">
                <div className="flex justify-between items-center gap-4">
                  {renderActions(["ready", "star"])}
                </div>
                {renderActions(["startGame"])}
              </div>
            )}
            {playingTable!.game.state === "ended" && (
              <div className="flex flex-col gap-2 min-w-[8rem]">
                {renderActions(["newGame", "resetSession"])}
              </div>
            )}
          </div>
        )}
      </>
    );
  },
);

const Action = memo(
  ({
    action,
    value,
    disabled,
    className = "",
    label,
    onAction,
  }: {
    action: PlayerAction;
    value?: unknown;
    disabled: boolean;
    className?: string;
    onAction?: () => Promise<void>;
    label: ReactNode;
  }) => {
    const def = ActionDef[action];

    const handleAction = () => {
      if (!onAction) return;
      return onAction();
    };

    return (
      <>
        {def.type === "button" && (
          <button
            className={`${className}`}
            disabled={disabled}
            onClick={handleAction}
          >
            {label}
          </button>
        )}
        {def.type === "checkbox" && (
          <button
            className={`!py-1 !px-2 flex items-center`}
            disabled={disabled}
            onClick={handleAction}
          >
            <input
              className="h-[1.25rem] w-[1.25rem]"
              name="meIsReady"
              type="checkbox"
              checked={!!value}
              readOnly={true}
            />
            <span className="ml-1">{label}</span>
          </button>
        )}
      </>
    );
  },
);

export default Actions;

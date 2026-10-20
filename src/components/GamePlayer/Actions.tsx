import { memo, useEffect, useState, type ReactNode } from "react";
import {
  ActionDef,
  findNextAutoPlayer,
  getAutoPlayCards,
  getCurrentPossibleActions,
  isGameInProgress,
} from "@logic/game";
import { checkWhiteTiger, WhiteTigerRankKey } from "@logic/hand";
import { handlePhomAutoAction } from "@logic/phom";
import {
  canCall,
  getCallAmount,
  getRaiseBounds,
  handlePokerAutoAction,
} from "@logic/poker";
import useI18n from "@hooks/useI18n";
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
    const { t } = useI18n();
    const { playingTable, retryPeerTransport } = useAppData();
    const { localPlayer } = useLocalPlayer();
    const ds = useCountDown(playingTable!.game.turnEndTs);

    const isPoker = playingTable!.gameType === "poker";
    const isFacingBet =
      isPoker && canCall(playingTable!.game, gamePlayer);
    const callTarget = isPoker
      ? (gamePlayer.streetBet ?? 0) +
        getCallAmount(playingTable!.game, gamePlayer)
      : 0;
    const pokerBounds = isPoker
      ? getRaiseBounds(playingTable!, gamePlayer)
      : { canRaise: false, minTotalBet: 0, maxTotalBet: 0 };

    const defaultBetAmount = isFacingBet
      ? callTarget
      : pokerBounds.minTotalBet;

    const [raiseAmount, setRaiseAmount] = useState<number>(defaultBetAmount);

    useEffect(() => {
      if (playingTable?.gameType !== "poker") return;
      setRaiseAmount(defaultBetAmount);
    }, [
      playingTable?.gameType,
      playingTable?.game.currentPlayerId,
      playingTable?.game.round,
      defaultBetAmount,
    ]);

    const clampedRaise =
      isFacingBet && raiseAmount <= callTarget
        ? callTarget
        : Math.max(
            pokerBounds.minTotalBet,
            Math.min(
              pokerBounds.maxTotalBet,
              Math.floor(raiseAmount || pokerBounds.minTotalBet),
            ),
          );

    const handleAutoAction = () => {
      if (!isGameInProgress(playingTable!.game)) {
        return;
      }
      const curPlayer = playingTable!.game.players.find(
        (item) => item.id === playingTable!.game.currentPlayerId,
      );
      if (playingTable!.gameType === "poker") {
        onAction(handlePokerAutoAction(playingTable!, curPlayer!));
        return;
      }
      if (playingTable!.gameType === "phom") {
        onAction(handlePhomAutoAction(playingTable!, curPlayer!));
        return;
      }
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
              className={`flex ${playingTable!.gameType === "poker" ? "flex-1 !min-w-[4.5rem] sm:!min-w-[6.5rem] !max-w-[9.5rem] text-xs sm:text-sm" : "w-1/2 lg:w-1/4 !min-w-[5.5rem] sm:!min-w-[8rem] !max-w-[12rem]"} py-1 border-2 rounded-sm font-semibold`}
              activeClassName={def.activeClassName}
              inactiveClassName={def.inactiveClassName}
              onConfirm={() =>
                onAction(
                  def.handleAction(
                    playingTable!,
                    {
                      ...gamePlayer,
                      selectedCards,
                    },
                    action === "raise" ? { amount: clampedRaise } : undefined,
                  ),
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
              onAction={() => {
                const next = def.handleAction(playingTable!, gamePlayer);
                const pending = onAction(next);
                if (action === "resetSession" && next !== playingTable) {
                  retryPeerTransport();
                }
                return pending;
              }}
            />
          );
        })
        .filter(Boolean);
    };

    const renderLabel = (action: PlayerAction): ReactNode => {
      const def = ActionDef[action as PlayerAction];
      let label = t(def.label);
      if (action === "raise" && playingTable!.gameType === "poker") {
        if (!isFacingBet) {
          return clampedRaise >= pokerBounds.maxTotalBet
            ? t("action.allIn")
            : t("action.bet");
        }
        return pokerBounds.canRaise && raiseAmount > callTarget
          ? t("action.raise")
          : t("action.call");
      }
      if (action !== "tiger") {
        return label;
      }

      const whiteTiger = checkWhiteTiger(gamePlayer.cards);
      if (whiteTiger > 0) {
        label = t(WhiteTigerRankKey[whiteTiger]);
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
          <div className="w-full flex items-center gap-1">
            {playingTable!.gameType === "poker" ? (
              <div className="w-full flex flex-col items-end justify-center gap-1">
                {pokerBounds.canRaise && (
                  <div className="flex flex-col gap-1 bg-white/90 border border-gray-300 rounded-sm p-1 shadow-sm max-w-full">
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {isFacingBet && (
                        <button
                          type="button"
                          className="!px-1.5 !py-0.5 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded border border-emerald-300"
                          onClick={() => setRaiseAmount(callTarget)}
                        >
                          {t("action.call")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="!px-1.5 !py-0.5 text-xs bg-cyan-100 hover:bg-cyan-200 text-cyan-900 rounded border border-cyan-300"
                        onClick={() => setRaiseAmount(pokerBounds.minTotalBet)}
                      >
                        {t("game.min")}
                      </button>
                      <button
                        type="button"
                        className="!px-1.5 !py-0.5 text-xs bg-cyan-100 hover:bg-cyan-200 text-cyan-900 rounded border border-cyan-300"
                        onClick={() =>
                          setRaiseAmount(
                            Math.max(
                              pokerBounds.minTotalBet,
                              Math.min(
                                pokerBounds.maxTotalBet,
                                (playingTable!.game.currentBet ?? 0) +
                                  Math.floor(
                                    (playingTable!.game.pot ?? 0) / 2,
                                  ),
                              ),
                            ),
                          )
                        }
                      >
                        {t("game.halfPot")}
                      </button>
                      <button
                        type="button"
                        className="!px-1.5 !py-0.5 text-xs bg-cyan-100 hover:bg-cyan-200 text-cyan-900 rounded border border-cyan-300"
                        onClick={() =>
                          setRaiseAmount(
                            Math.max(
                              pokerBounds.minTotalBet,
                              Math.min(
                                pokerBounds.maxTotalBet,
                                (playingTable!.game.currentBet ?? 0) +
                                  (playingTable!.game.pot ?? 0),
                              ),
                            ),
                          )
                        }
                      >
                        {t("game.fullPot")}
                      </button>
                      <button
                        type="button"
                        className="!px-1.5 !py-0.5 text-xs bg-cyan-100 hover:bg-cyan-200 text-cyan-900 rounded border border-cyan-300"
                        onClick={() => setRaiseAmount(pokerBounds.maxTotalBet)}
                      >
                        {t("game.allIn")}
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="range"
                        className="w-20 sm:w-28 accent-cyan-700"
                        min={defaultBetAmount}
                        max={pokerBounds.maxTotalBet}
                        value={clampedRaise}
                        onChange={(e) => {
                          const nextVal = Number(e.target.value);
                          if (
                            isFacingBet &&
                            nextVal > callTarget &&
                            nextVal < pokerBounds.minTotalBet
                          ) {
                            setRaiseAmount(
                              raiseAmount <= callTarget
                                ? pokerBounds.minTotalBet
                                : callTarget,
                            );
                            return;
                          }
                          setRaiseAmount(nextVal);
                        }}
                      />
                      <input
                        type="number"
                        className="w-16 !px-1 !py-0.5 text-xs border border-gray-300 rounded text-right"
                        min={defaultBetAmount}
                        max={pokerBounds.maxTotalBet}
                        value={raiseAmount}
                        onChange={(e) =>
                          setRaiseAmount(Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="w-full flex flex-wrap justify-end gap-1">
                  {renderTwoStepButtonActions(["fold", "check", "raise"])}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex justify-start gap-1">
                  {renderTwoStepButtonActions([
                    "pass",
                    "ask",
                    "draw",
                    "meld",
                    "send",
                  ])}
                </div>
                <div className="flex-1 flex justify-end gap-1">
                  {renderTwoStepButtonActions(["eat", "u", "play", "tiger"])}
                </div>
              </>
            )}
          </div>
        )}

        {!isGameInProgress(playingTable!.game) && (
          <div
            className={`w-full flex items-center ${playingTable!.gameType === "poker" ? "justify-end" : "justify-center bg-cyan-50/60"} gap-8`}
          >
            {playingTable!.game.state === "waiting" && (
              <div className="flex flex-col gap-2 min-w-[8rem]">
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

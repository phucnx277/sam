import { memo } from "react";
import { ActionDef } from "@logic/game";

const Actions = memo(
  ({
    gamePlayer,
    playingTable,
    selectedCards,
    onAction,
  }: {
    gamePlayer: GamePlayer;
    playingTable: Table;
    selectedCards: Card[];
    onAction: (table: Table) => Promise<void>;
  }) => {
    return (
      <div className="flex flex-col w-[8rem] gap-y-1">
        {Object.keys(ActionDef).map((action) => (
          <Action
            key={action}
            action={action as PlayerAction}
            playingTable={playingTable}
            gamePlayer={gamePlayer}
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
    gamePlayer,
    playingTable,
    selectedCards,
    onAction,
  }: {
    action: PlayerAction;
    gamePlayer: GamePlayer;
    playingTable: Table;
    selectedCards: Card[];
    onAction: (table: Table) => Promise<void>;
  }) => {
    const gpWithCards = { ...gamePlayer, selectedCards };
    const def = ActionDef[action];
    const { visible, disabled, value } = def.checkState(
      playingTable,
      gpWithCards,
    );
    const handleAction = () => {
      return onAction(def.handleAction(playingTable, gpWithCards));
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

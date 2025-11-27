import { newGame, newGamePlayer } from "./game";
import { generateId } from "./util";

export const TABLE_LIMIT = 10;

export type NewTableParams = {
  name: string;
  password: string;
  player: Player;
  playerLimit: number;
  bo: number;
  turnTimeout: number;
};

export type EnterTableParams = {
  table: Table;
  password: string;
  player: Player;
};

export const newTable = (params: NewTableParams): Table => {
  const now = Date.now();
  const table: Table = {
    id: generateId("tbl"),
    hostId: params.player.id,
    name: params.name,
    password: params.password,
    bo: params.bo,
    playerLimit: params.playerLimit,
    createdAt: now,
    updatedAt: now,
    lastGame: null,
    game: newGame(null, [newGamePlayer(params.player)], {
      turnTimeout: params.turnTimeout,
    }),
    turnTimeout: params.turnTimeout,
  };

  return table;
};

export const enterTable = (
  params: EnterTableParams,
): { error: Error | null; table: Table | null } => {
  const table = { ...params.table };

  if (
    table.password &&
    params.player.id !== table.hostId &&
    params.password !== table.password
  ) {
    return {
      error: new Error("Password is incorrect"),
      table,
    };
  }

  if (
    table.game.players.findIndex((item) => item.id === params.player.id) === -1
  ) {
    if (table.game.players.length >= table.playerLimit) {
      return {
        error: new Error(`Table can only have ${table.playerLimit} players.`),
        table,
      };
    }
    table.game.players = [...table.game.players, newGamePlayer(params.player)];
  }

  return {
    error: null,
    table,
  };
};

export const resetSession = (table: Table): Table => {
  return {
    ...table,
    game: newGame(
      null,
      table.game.players.map((gp) => ({ ...gp, chipCount: 0 })),
      { turnTimeout: table.turnTimeout },
    ),
    lastGame: null,
    updatedAt: Date.now(),
  };
};

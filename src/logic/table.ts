import { newGame, newGamePlayer } from "./game";
import { generateId } from "./util";
export const LIMIT = 10;
export const PLAYER_LIMIT = 5;

export type NewTableParams = {
  name: string;
  password: string;
  player: Player;
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
    createdAt: now,
    updatedAt: now,
    lastGame: null,
    game: newGame(null, [newGamePlayer(params.player)]),
  };

  return table;
};

export const enterTable = (
  params: EnterTableParams,
): { error: Error | null; table: Table | null } => {
  const table = { ...params.table };

  if (params.player.id !== table.hostId && params.password !== table.password) {
    return {
      error: new Error("Password is incorrect"),
      table,
    };
  }

  if (
    table.game.players.findIndex((item) => item.id === params.player.id) === -1
  ) {
    if (table.game.players.length >= PLAYER_LIMIT) {
      return {
        error: new Error("Too many players"),
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

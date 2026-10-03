import { findNextActivePlayerId, newGame, newGamePlayer } from "./game";
import { generateId } from "./util";
import { t } from "./i18n";

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
    hostEpoch: 0,
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
    players: [
      {
        id: params.player.id,
        name: params.player.name,
        chipCount: 0,
      },
    ],
  };

  return table;
};

export type JoinRejectReason = "password" | "full";

export const validateJoin = (
  table: Table,
  player: Player,
  password: string,
): JoinRejectReason | null => {
  const alreadyPresent = table.game.players.some(
    (item) => item.id === player.id,
  );

  if (
    table.password &&
    player.id !== table.hostId &&
    password !== table.password
  ) {
    return "password";
  }

  if (!alreadyPresent && table.game.players.length >= table.playerLimit) {
    return "full";
  }

  return null;
};

export const enterTable = (
  params: EnterTableParams,
): { error: Error | null; table: Table | null } => {
  const table = { ...params.table };

  const reason = validateJoin(table, params.player, params.password);
  if (reason) {
    return {
      error: new Error(
        reason === "password"
          ? t("error.passwordIncorrect")
          : t("error.tableFull", { limit: table.playerLimit }),
      ),
      table,
    };
  }

  if (
    table.game.players.findIndex((item) => item.id === params.player.id) === -1
  ) {
    const tblPlayer = table.players.find(
      (item) => item.id === params.player.id && item.isRemoved,
    );
    const newGp = newGamePlayer(params.player);

    if (tblPlayer) {
      tblPlayer.isRemoved = false;
      newGp.chipCount = tblPlayer.chipCount;
    }

    table.game.players = [...table.game.players, newGp];
  }

  if (table.players.findIndex((item) => item.id === params.player.id) === -1) {
    table.players = [
      ...table.players,
      {
        id: params.player.id,
        name: params.player.name,
        chipCount: 0,
      },
    ];
  }

  return {
    error: null,
    table,
  };
};

export const addTablePlayer = (table: Table, player: Player): Table => {
  const next: Table = {
    ...table,
    game: { ...table.game, players: [...table.game.players] },
    players: [...table.players],
  };

  if (next.game.players.findIndex((item) => item.id === player.id) === -1) {
    const tblPlayer = next.players.find(
      (item) => item.id === player.id && item.isRemoved,
    );
    const newGp = newGamePlayer(player);
    if (tblPlayer) {
      newGp.chipCount = tblPlayer.chipCount;
      next.players = next.players.map((item) =>
        item.id === player.id ? { ...item, isRemoved: false } : item,
      );
    }
    next.game.players = [...next.game.players, newGp];
  }

  if (next.players.findIndex((item) => item.id === player.id) === -1) {
    next.players = [
      ...next.players,
      { id: player.id, name: player.name, chipCount: 0 },
    ];
  }

  return next;
};

export const isTableMember = (table: Table, player: Player): boolean =>
  table.hostId === player.id ||
  table.players.some((item) => item.id === player.id && !item.isRemoved);

export const visibleTables = (
  tables: Table[],
  player: Player | null,
): Table[] =>
  !player || player.isAdmin
    ? tables
    : tables.filter((table) => isTableMember(table, player));

export const hostedTables = (
  tables: Table[],
  player: Player | null,
): Table[] =>
  !player ? [] : tables.filter((table) => table.hostId === player.id);

const hiddenCard = (index: number): Card => ({
  rank: ((index % 13) + 1) as Rank,
  suit: "S",
  hidden: true,
});

export const maskTableFor = (table: Table, viewerId: string): Table => {
  if (table.game.state === "ended") return table;
  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((gp) =>
        gp.id === viewerId
          ? gp
          : {
              ...gp,
              cards: gp.cards.map((_, index) => hiddenCard(index)),
              selectedCards: gp.selectedCards.map((_, index) =>
                hiddenCard(index),
              ),
            },
      ),
    },
  };
};

export const hasHiddenCards = (cards: Card[]): boolean =>
  cards.length > 0 && cards.every((card) => card.hidden);

export const resetSession = (table: Table): Table => {
  return {
    ...table,
    game: newGame(
      null,
      table.game.players.map((gp) => ({ ...gp, chipCount: 0 })),
      { turnTimeout: table.turnTimeout },
    ),
    lastGame: null,
    players: table.game.players.map((item) => ({
      id: item.id,
      name: item.name,
      chipCount: 0,
    })),
    updatedAt: Date.now(),
  };
};

export const promoteHost = (table: Table, winnerId: string): Table => {
  const oldHostId = table.hostId;
  const game: Game = {
    ...table.game,
    players: table.game.players.map((gp) =>
      gp.id === oldHostId ? { ...gp, isDisconnected: true } : gp,
    ),
  };

  const active = game.players.filter((gp) => gp.isReady && !gp.isAway);
  if (
    active.length >= 2 &&
    game.currentPlayerId &&
    !active.some((gp) => gp.id === game.currentPlayerId)
  ) {
    game.currentPlayerId = findNextActivePlayerId(game, game.currentPlayerId);
    game.turnStartTs = Date.now();
    game.turnEndTs =
      game.turnTimeout > 0
        ? game.turnStartTs + game.turnTimeout * 1000
        : -1;
  }

  return {
    ...table,
    hostId: winnerId,
    hostEpoch: (table.hostEpoch ?? 0) + 1,
    updatedAt: Date.now(),
    game,
  };
};

export type RejoinInfo = { gameId?: string; cards?: Card[] };

export const markPlayerDisconnected = (
  table: Table,
  playerId: string,
): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp || gp.isDisconnected) return table;
  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((item) =>
        item.id === playerId ? { ...item, isDisconnected: true } : item,
      ),
    },
    updatedAt: Date.now(),
  };
};

export const applyRejoin = (table: Table, playerId: string): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp) return table;
  const nextAway = !!gp.isRemoved;
  if (!gp.isDisconnected && !!gp.isAway === nextAway) return table;
  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((item) =>
        item.id === playerId
          ? { ...item, isDisconnected: false, isAway: nextAway }
          : item,
      ),
    },
    updatedAt: Date.now(),
  };
};

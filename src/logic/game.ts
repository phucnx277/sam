import {
  areCardsIdentical,
  canBeat,
  isFourOfAKind,
  getSortedCards,
} from "./card";
import { CardsPerPlayer, createDeck, dealCards, shuffleDeck } from "./deck";
import { checkWhiteTiger } from "./hand";
import { divideGamePlayers, rotateGamePlayers } from "./player";
import { resetSession } from "./table";
import { generateId, randomInt } from "./util";

const PlayTimeoutMs = 20_000;
const ChipDeductionLevel: Record<
  "Normal" | "StarOfHope",
  { OneCard: number; Fired: number; Tiger: number }
> = {
  Normal: {
    OneCard: 1,
    Fired: 15,
    Tiger: 20,
  },
  StarOfHope: {
    OneCard: 2,
    Fired: 20,
    Tiger: 30,
  },
};

export const newGame = (lastGame: Game | null, players: GamePlayer[]): Game => {
  const currentPlayerId = lastGame?.winnerId || null;

  return {
    id: generateId("game"),
    state: "waiting",
    currentPlayerId,
    startPlayerId: currentPlayerId,
    lastPlayedCards: [],
    players: players.map((player) => ({
      ...player,
      isReady: false,
      cards: [],
      selectedCards: [],
      lastPlayedRound: -1,
      lastAction: null,
    })),
    playHistory: [],
    winnerId: null,
    round: -1,
    startedAt: -1,
    turnStartTs: -1,
    turnEndTs: -1,
  };
};

export const newGamePlayer = (player: Player): GamePlayer => {
  return {
    ...player,
    isReady: false,
    cards: [],
    selectedCards: [],
    chipCount: 0,
    lastPlayedRound: -1,
    lastAction: null,
    starOfHope: false,
  };
};

export const startGame = (game: Game): Game => {
  const players = game.players.filter((player) => player.isReady);
  const deck = createDeck();
  const cards = shuffleDeck(deck, randomInt(3, 10));
  const hands = dealCards(cards, players.length);
  let state: GameState = "handChecking";
  let initialRound = -1;
  let currentPlayerId = game.currentPlayerId;
  if (players.findIndex((item) => item.id === currentPlayerId) === -1) {
    currentPlayerId = null;
  }
  if (!currentPlayerId) {
    const handIdx = hands.findIndex((hand: Card[]) =>
      hand.some((card) => card.suit === "S" && card.rank === 3),
    );
    if (handIdx === -1) return startGame(game);
    // first game of the session, no tiger allowed
    state = "playing";
    initialRound = 0;
    currentPlayerId = players[handIdx].id;
  }

  const startingGame: Game = {
    ...game,
    currentPlayerId,
    startPlayerId: currentPlayerId,
    players: game.players.map((player) => ({
      ...player,
      cards: player.isReady ? hands.shift()! : [],
      lastAction: null,
      lastPlayedRound: initialRound,
    })),
    round: initialRound,
    state,
    startedAt: Date.now(),
  };
  updateTurnTimes(startingGame);
  return startingGame;
};

export const ActionDef: Record<
  PlayerAction,
  {
    label: string;
    type: "button" | "checkbox";
    className?: string;
    checkState: (
      playingTable: Table,
      currentPlayer: GamePlayer,
    ) => { disabled: boolean; visible: boolean; value?: unknown };
    handleAction: (playingTable: Table, currentPlayer: GamePlayer) => Table;
  }
> = {
  ready: {
    label: "I'm ready",
    type: "checkbox",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean; value?: unknown } {
      const visible = playingTable.game.state === "waiting";
      return { visible, disabled: false, value: currentPlayer.isReady };
    },
    handleAction(playingTable: Table, currentPlayer?: GamePlayer): Table {
      return {
        ...playingTable,
        game: {
          ...playingTable.game,
          players: playingTable.game.players.map((gamePlayer) => {
            return {
              ...gamePlayer,
              isReady:
                gamePlayer.id === currentPlayer?.id
                  ? !gamePlayer.isReady
                  : gamePlayer.isReady,
            };
          }),
        },
      };
    },
  },
  star: {
    label: "⭐ hy vọng",
    type: "checkbox",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean; value?: unknown } {
      const visible =
        playingTable.bo < 0 && playingTable.game.state === "waiting";
      return { visible, disabled: false, value: currentPlayer.starOfHope };
    },
    handleAction(playingTable: Table, currentPlayer?: GamePlayer): Table {
      return {
        ...playingTable,
        game: {
          ...playingTable.game,
          players: playingTable.game.players.map((gamePlayer) => {
            return {
              ...gamePlayer,
              starOfHope:
                gamePlayer.id === currentPlayer?.id
                  ? !gamePlayer.starOfHope
                  : gamePlayer.starOfHope,
            };
          }),
        },
      };
    },
  },
  newGame: {
    label: "Ván mới",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { visible: boolean; disabled: boolean } {
      const isBO = playingTable.bo > 0;
      const wins = Math.ceil(playingTable.bo / 2);
      const visible =
        playingTable.game.state === "ended" &&
        playingTable.game.winnerId === currentPlayer.id;
      const disabled = isBO && currentPlayer.chipCount >= wins;

      return { visible, disabled };
    },
    handleAction(playingTable): Table {
      return {
        ...playingTable,
        lastGame: playingTable.game,
        game: newGame(playingTable.game, playingTable.game.players),
      };
    },
  },
  startGame: {
    label: "Chia bài",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        playingTable.game.state === "waiting" &&
        (playingTable.lastGame
          ? playingTable.lastGame.winnerId === currentPlayer.id
          : playingTable.hostId === currentPlayer.id);
      const disabled =
        !currentPlayer.isReady ||
        playingTable.game.players.filter((gp) => gp.isReady).length < 2;

      return {
        visible,
        disabled,
      };
    },
    handleAction(playingTable: Table): Table {
      const table = {
        ...playingTable,
      };
      table.game = startGame(table.game);
      return table;
    },
  },
  ask: {
    label: "Hỏi",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        currentPlayer.isReady &&
        playingTable.game.state === "handChecking" &&
        playingTable.game.round < 0 &&
        currentPlayer.id === playingTable.lastGame?.winnerId;
      const disabled =
        !isPlayerTurn(playingTable.game, currentPlayer) ||
        isActionTimeouted(playingTable.game);
      return { visible, disabled };
    },
    handleAction(playingTable: Table): Table {
      const table = { ...playingTable };
      table.game = {
        ...table.game,
        players: table.game.players.map((gamePlayer) => {
          if (gamePlayer.id !== table.game.currentPlayerId) {
            return gamePlayer;
          }
          return {
            ...gamePlayer,
            lastPlayedRound: 0,
            lastAction: "ask",
          };
        }),
        round: 0,
      };
      table.game.currentPlayerId = findNextPlayerId(table.game);
      updateTurnTimes(table.game);
      return table;
    },
  },
  tiger: {
    label: "Báo",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        currentPlayer.isReady && playingTable.game.state === "handChecking";
      const disabled =
        !isPlayerTurn(playingTable.game, currentPlayer) ||
        isActionTimeouted(playingTable.game);

      return {
        visible,
        disabled,
      };
    },
    handleAction(playingTable: Table): Table {
      const table = { ...playingTable };
      table.game = {
        ...table.game,
        players: table.game.players.map((gamePlayer) => {
          if (gamePlayer.id !== table.game.currentPlayerId) {
            return gamePlayer;
          }
          return {
            ...gamePlayer,
            lastAction: "tiger",
            lastPlayedRound: 0,
          };
        }),
        round: 0,
      };
      table.game.currentPlayerId = findNextPlayerId(table.game);

      // "handChecking" round finishes
      if (table.game.currentPlayerId === table.game.startPlayerId) {
        table.game = evaluateTigers(table.game);
        table.game.state = "playing";
      }
      updateTurnTimes(table.game);
      return table;
    },
  },
  play: {
    label: "Đánh",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        currentPlayer.isReady && playingTable.game.state === "playing";
      const disabled =
        isActionTimeouted(playingTable.game) ||
        !isPlayerTurn(playingTable.game, currentPlayer) ||
        isPlayerPassedTurn(playingTable.game, currentPlayer) ||
        (isFirstGame(playingTable) &&
          isFirstToAct(playingTable.game, currentPlayer) &&
          currentPlayer.selectedCards.length > 1) ||
        !currentPlayer.selectedCards.length ||
        !canBeat(
          currentPlayer.selectedCards,
          currentPlayer.cards,
          isEveryonePassed(playingTable.game)
            ? []
            : playingTable.game.lastPlayedCards,
        );
      return { visible, disabled };
    },
    handleAction(playingTable: Table, currentPlayer: GamePlayer) {
      const table = { ...playingTable };
      const nextRound =
        playingTable.game.playHistory.length === 0 ||
        isEveryonePassed(table.game)
          ? table.game.round + 1
          : table.game.round;
      const cardsAfterPlay = currentPlayer.cards.filter(
        (card) =>
          !currentPlayer.selectedCards.find((sc) =>
            areCardsIdentical(card, sc),
          ),
      );
      table.game = {
        ...table.game,
        round: nextRound,
        lastPlayedCards: currentPlayer.selectedCards.map((item) => {
          const c = { ...item };
          delete c.folded;
          delete c.selected;
          return c;
        }),
        playHistory: [
          ...table.game.playHistory,
          {
            playerId: currentPlayer.id,
            cards: currentPlayer.selectedCards.map((item) => {
              const c = { ...item };
              delete c.folded;
              delete c.selected;
              return c;
            }),
            round: nextRound,
          },
        ],
        players: table.game.players.map((gamePlayer) => {
          if (gamePlayer.id !== currentPlayer.id) {
            return gamePlayer;
          }
          return {
            ...gamePlayer,
            lastPlayedRound: nextRound,
            lastAction: gamePlayer.lastAction === "tiger" ? "tiger" : "play",
            cards: cardsAfterPlay,
          };
        }),
      };
      table.game = checkAndUpdateIfGameEnded(table);
      return table;
    },
  },

  pass: {
    label: "Bỏ",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const isTurn = isPlayerTurn(playingTable.game, currentPlayer);
      const visible =
        currentPlayer.isReady &&
        isGameInProgress(playingTable.game) &&
        !isFirstToAct(playingTable.game, currentPlayer) &&
        currentPlayer.lastAction !== "tiger";
      const disabled =
        isActionTimeouted(playingTable.game) ||
        !isTurn ||
        (isTurn && isEveryonePassed(playingTable.game));
      return { visible, disabled };
    },
    handleAction(playingTable: Table): Table {
      const table = { ...playingTable };
      table.game = {
        ...table.game,
        players: table.game.players.map((gamePlayer) => {
          if (gamePlayer.id !== table.game.currentPlayerId) {
            return gamePlayer;
          }
          return {
            ...gamePlayer,
            lastPlayedRound: table.game.round,
            lastAction: "pass",
          };
        }),
      };
      table.game.currentPlayerId = findNextPlayerId(table.game);

      // "playing" state - everyone passed, new round
      if (table.game.state === "playing" && isEveryonePassed(table.game)) {
        table.game.players = calcRoundChipCount(table);
      }

      // "handChecking" round finishes
      if (
        table.game.state === "handChecking" &&
        table.game.currentPlayerId === table.game.startPlayerId
      ) {
        table.game = evaluateTigers(table.game);
        table.game.state = "playing";
      }

      updateTurnTimes(table.game);

      return table;
    },
  },
  resetSession: {
    label: "Reset session",
    type: "button",
    checkState(
      playingTable: Table,
      currentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean; value?: unknown } {
      const visible =
        playingTable.game.state === "ended" &&
        playingTable.game.winnerId === currentPlayer.id;
      return {
        visible,
        disabled: false,
      };
    },
    handleAction(playingTable: Table): Table {
      const shouldReset = window.confirm("Chắc chưa?");
      if (shouldReset) {
        return resetSession(playingTable);
      }
      return playingTable;
    },
  },
};

const updateTurnTimes = (game: Game) => {
  game.turnStartTs = Date.now();
  game.turnEndTs = game.turnStartTs + PlayTimeoutMs;
};

const evaluateTigers = (game: Game): Game => {
  const { tigers, positive, multiple } = gameHasTigers(game);

  //no tiger: keep the current player turn
  if (!positive) {
    return game;
  }
  // has one tiger: make tiger the current player
  if (!multiple) {
    return {
      ...game,
      currentPlayerId: tigers[0].id,
    };
  }

  // check if there are white winners
  let whiteTigers: [number, GamePlayer][] = [];
  for (const gp of tigers) {
    const rank = checkWhiteTiger(gp.cards);
    const hr = whiteTigers[0]?.[0] || 0;
    if (rank > hr) {
      whiteTigers = [[rank, gp]];
    }
    if (rank === hr) {
      whiteTigers.push([rank, gp]);
    }
  }

  const sortedGps = rotateGamePlayers(game.players, game.startPlayerId!);
  let tigerId = "";

  if (whiteTigers.length === 1) {
    // there is only one white tiger => make it the current player
    tigerId = whiteTigers[0][1].id;
  } else if (whiteTigers.length > 1) {
    // there are multile white tigers => choose the first one after the winner of the last game
    const whiteTigerIds = whiteTigers.map((item) => item[1].id);
    tigerId = sortedGps.filter((gp) => whiteTigerIds.includes(gp.id))[0].id;
  } else if (whiteTigers.length === 0) {
    // there are multile tigers but no white tiger => choose the first one after the winner of the last game
    const tigerIds = tigers.map((item) => item.id);
    tigerId = sortedGps.filter((gp) => tigerIds.includes(gp.id))[0].id;
  }
  return {
    ...game,
    currentPlayerId: tigerId,
    players: game.players.map((gp) => {
      if (gp.id === tigerId) return gp;
      return {
        ...gp,
        lastAction: null,
      };
    }),
  };
};

const checkAndUpdateIfGameEnded = (table: Table): Game => {
  const game = { ...table.game };
  const ended = isGameEnded(table);
  if (ended) {
    game.state = "ended";
    game.winnerId = game.currentPlayerId;
    game.players = calcGameChipCount({ ...table, game }).map((item) => ({
      ...item,
      cards: item.cards.map((card) => ({ ...card, folded: false })),
    }));
  } else {
    game.state = "playing";
    game.currentPlayerId = findNextPlayerId(game);
    updateTurnTimes(game);
  }
  return game;
};

const isGameEnded = (table: Table): boolean => {
  const game = table.game;
  const isBO = table.bo > 0;
  const gamePlayers = game.players.filter((gp) => gp.isReady);
  const { positive } = gameHasTigers(game);
  return gamePlayers.some(
    (gp) =>
      gp.cards.length === 0 ||
      (positive && gp.lastAction === "play") ||
      (isBO && isFourOfAKind(game.lastPlayedCards)),
  );
};

const calcGameChipCount = (table: Table): GamePlayer[] => {
  const game = table.game;
  const isBO = table.bo > 0;
  const { targetGamePlayer: winner, opponents } = divideGamePlayers(
    game.players,
    game.winnerId!,
  );
  const chipChanges: Record<string, number> = game.players.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: 0 }),
    {},
  );
  if (!isBO) {
    const { tiger, tigerKiller } = findTigerAndKiller(game);
    if (tiger) {
      if (tigerKiller) {
        const chipDeductionLevel =
          tiger.starOfHope && tigerKiller.starOfHope
            ? ChipDeductionLevel.StarOfHope
            : ChipDeductionLevel.Normal;
        chipChanges[tigerKiller.id] =
          chipDeductionLevel.Tiger * opponents.length;
        if (isFourOfAKind(game.playHistory.slice(-1)[0].cards)) {
          chipChanges[tigerKiller.id] += chipDeductionLevel.Tiger;
        }
        chipChanges[tiger.id] = -chipChanges[tigerKiller.id];
      } else {
        for (const op of opponents) {
          const chipDeductionLevel =
            tiger.starOfHope && op.starOfHope
              ? ChipDeductionLevel.StarOfHope
              : ChipDeductionLevel.Normal;
          chipChanges[tiger.id] += chipDeductionLevel.Tiger;
          chipChanges[op.id] -= chipDeductionLevel.Tiger;
        }
      }
    } else {
      for (const op of opponents) {
        const chipDeductionLevel =
          winner.starOfHope && op.starOfHope
            ? ChipDeductionLevel.StarOfHope
            : ChipDeductionLevel.Normal;
        const value =
          op.cards.length === CardsPerPlayer
            ? chipDeductionLevel.Fired
            : chipDeductionLevel.OneCard * op.cards.length;
        chipChanges[winner.id] += value;
        chipChanges[op.id] = -value;
      }
    }
  } else {
    for (const gp of game.players) {
      if (gp.id === game.winnerId) {
        chipChanges[gp.id] = 1;
      }
    }
  }
  return game.players.map((gp) => ({
    ...gp,
    chipCount: gp.chipCount + chipChanges[gp.id],
  }));
};

const calcRoundChipCount = (table: Table): GamePlayer[] => {
  if (table.bo > 0) return table.game.players;

  const game = table.game;
  const playsInRound = game.playHistory.filter(
    (ele) => ele.round === game.round,
  );
  if (playsInRound.length <= 1) return game.players;
  const gamePlayerRec: Record<string, GamePlayer> = game.players.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: cur }),
    {},
  );
  const chipChanges: Record<string, number> = game.players.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: 0 }),
    {},
  );
  for (let i = 1; i < playsInRound.length; i++) {
    const currentPlay = playsInRound[i];
    const prevPlay = playsInRound[i - 1];
    let chipDeduction = ChipDeductionLevel.Normal;
    if (
      gamePlayerRec[currentPlay.playerId].starOfHope &&
      gamePlayerRec[prevPlay.playerId].starOfHope
    ) {
      chipDeduction = ChipDeductionLevel.StarOfHope;
    }
    if (isFourOfAKind(currentPlay.cards)) {
      chipChanges[currentPlay.playerId] =
        chipChanges[prevPlay.playerId] + chipDeduction.Tiger;
      chipChanges[prevPlay.playerId] = -chipChanges[currentPlay.playerId];
    }
  }
  const gamePlayers = game.players.map((gp) => ({
    ...gp,
    chipCount: gp.chipCount + chipChanges[gp.id],
  }));
  return gamePlayers;
};

function findNextPlayerId(game: Game): string {
  const gamePlayers = rotateGamePlayers(
    game.players.filter((item) => item.isReady),
    game.currentPlayerId!,
  );
  let index = 1;
  while (index < gamePlayers.length) {
    const nextPlayer = gamePlayers[index];
    const lostTurn = isPlayerPassedTurn(game, nextPlayer);
    if (!lostTurn) {
      return nextPlayer.id;
    }
    index++;
  }
  return gamePlayers[0].id;
}

export function findNextAutoPlayer(
  game: Game,
  checkAfterIndex = 0,
): GamePlayer {
  const gamePlayers = rotateGamePlayers(
    game.players.filter((item) => item.isReady),
    game.currentPlayerId!,
  );
  checkAfterIndex = Math.max(checkAfterIndex, 0);
  checkAfterIndex = Math.min(checkAfterIndex, gamePlayers.length - 2);
  const index = checkAfterIndex + 1;
  return gamePlayers[index];
}

function isPlayerTurn(game: Game, player: GamePlayer): boolean {
  return (
    game.currentPlayerId === player.id && !isPlayerPassedTurn(game, player)
  );
}

function isPlayerPassedTurn(game: Game, player: GamePlayer): boolean {
  return player.lastAction === "pass" && player.lastPlayedRound === game.round;
}

function isEveryonePassed(game: Game): boolean {
  return game.currentPlayerId === game.playHistory.slice(-1)[0]?.playerId;
}

export function isGameInProgress(game: Game): boolean {
  return game.state === "playing" || game.state === "handChecking";
}

function isFirstToAct(game: Game, player: GamePlayer): boolean {
  return (
    game.round <= 0 &&
    (!player.lastAction || player.lastAction === "ask") &&
    player.id === game.startPlayerId
  );
}

function isFirstGame(playingTable: Table): boolean {
  return !playingTable.lastGame;
}

function gameHasTigers(game: Game): {
  positive: boolean;
  multiple: boolean;
  tigers: GamePlayer[];
} {
  const tigers = game.players.filter((gp) => gp.lastAction === "tiger");
  return { positive: tigers.length > 0, multiple: tigers.length > 1, tigers };
}

export function findTigerAndKiller(game: Game): {
  tiger?: GamePlayer | null;
  tigerKiller?: GamePlayer | null;
} {
  const tiger = game.players.find((gp) => gp.lastAction === "tiger");
  const tigerKiller = tiger
    ? game.players.find((gp) => gp.lastAction === "play")
    : null;

  return { tiger, tigerKiller };
}

export function getCurrentPossibleActions(
  table: Table,
  player: GamePlayer,
): PlayerAction[] {
  const game = table.game;
  if (!isPlayerTurn(game, player)) return [];
  switch (game.state) {
    case "handChecking": {
      if (isFirstToAct(game, player)) {
        return ["ask", "tiger"];
      }
      return ["pass", "tiger"];
    }
    case "playing": {
      if (
        isEveryonePassed(game) ||
        (isFirstGame(table) && isFirstToAct(game, player))
      ) {
        return ["play"];
      }
      return ["pass", "play"];
    }
    case "waiting":
    case "ended": {
      return [];
    }
  }
}

function isActionTimeouted(game: Game): boolean {
  return Date.now() - game.turnEndTs >= 0;
}

export function getAutoPlayCards(cards: Card[]): Card[] {
  return getSortedCards(cards, false).slice(-1);
}

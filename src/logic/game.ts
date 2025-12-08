import {
  areCardsEqual,
  canBeat,
  isFourOfAKind,
  getSortedCards,
  shouldPayVillage,
  getSortedStraight,
} from "./card";
import { CardsPerPlayer, createDeck, dealCards, shuffleDeck } from "./deck";
import { checkWhiteTiger } from "./hand";
import { resetSession } from "./table";
import { generateId, randomInt } from "./util";

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

export const newGame = (
  lastGame: Game | null,
  players: GamePlayer[],
  config: { turnTimeout: number },
): Game => {
  const currentPlayerId = lastGame?.winnerId || null;

  return {
    id: generateId("game"),
    state: "waiting",
    currentPlayerId,
    startPlayerId: currentPlayerId,
    lastPlayedCards: [],
    players: players.map((player) => ({
      ...player,
      isReady: player.id === currentPlayerId,
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
    turnTimeout: config.turnTimeout,
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
    paidVillage: false,
  };
};

export const startGame = (game: Game, playerLimit: number): Game => {
  const players = game.players.filter((player) => player.isReady);
  if (players.length > playerLimit) {
    throw new Error("Number of players exceeds limit");
  }
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
    if (handIdx === -1) return startGame(game, playerLimit);
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
    inactiveClassName?: string;
    activeClassName?: string;
    checkState: (
      playingTable: Table,
      currentPlayer: GamePlayer,
    ) => { disabled: boolean; visible: boolean; value?: unknown };
    handleAction: (
      playingTable: Table,
      currentPlayer: GamePlayer,
      data?: unknown,
    ) => Table;
  }
> = {
  ready: {
    label: "Sẵn sàng",
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
      const winnerRemoved = !playingTable.game.players.some(
        (item) => item.id === playingTable.game.winnerId && item.isReady,
      );
      const visible =
        playingTable.game.state === "ended" &&
        (winnerRemoved ? playingTable.hostId : playingTable.game.winnerId) ===
          currentPlayer.id;
      const disabled = isBO && currentPlayer.chipCount >= wins;

      return { visible, disabled };
    },
    handleAction(playingTable): Table {
      return {
        ...playingTable,
        lastGame: playingTable.game,
        game: newGame(playingTable.game, playingTable.game.players, {
          turnTimeout: playingTable.turnTimeout,
        }),
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
      try {
        table.game = startGame(table.game, table.playerLimit);
      } catch (err) {
        alert((err as Error).message);
      }
      return table;
    },
  },
  ask: {
    label: "Hỏi",
    type: "button",
    inactiveClassName: "border-cyan-600/90 bg-cyan-300/30",
    activeClassName: "border-cyan-600/90 bg-cyan-600/90",
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
    label: "Báo 🐆",
    type: "button",
    inactiveClassName: "border-amber-600/90 bg-amber-300/30",
    activeClassName: "border-amber-600/90 bg-amber-600/90",
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
      const cf = window.confirm("Báo nhé 🐆?");
      if (!cf) {
        return playingTable;
      }

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
        table.game = checkAndUpdateIfGameEnded(table, true);
      }

      if (table.game.state === "ended") {
        table.players = syncChipCounts(table.game.players, table.players);
      }

      updateTurnTimes(table.game);

      return table;
    },
  },
  play: {
    label: "Đánh",
    type: "button",
    inactiveClassName: "border-green-600/90 bg-green-500/50",
    activeClassName: "border-green-600/95 bg-green-600/95",
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

      const lastPlayedCards = getSortedStraight(
        currentPlayer.selectedCards.map((item) => {
          const c = { ...item };
          delete c.folded;
          delete c.selected;
          return c;
        }),
      );
      table.game = {
        ...table.game,
        round: nextRound,
        lastPlayedCards,
        playHistory: [
          ...table.game.playHistory,
          {
            playerId: currentPlayer.id,
            cards: lastPlayedCards,
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
            cards: gamePlayer.cards.filter(
              (card) => !lastPlayedCards.some((sc) => areCardsEqual(card, sc)),
            ),
            selectedCards: lastPlayedCards,
          };
        }),
      };

      table.game = checkAndUpdateIfGameEnded(table, false);

      if (table.game.state === "ended") {
        table.players = syncChipCounts(table.game.players, table.players);
      }

      return table;
    },
  },

  pass: {
    label: "Bỏ",
    type: "button",
    inactiveClassName: "border-gray-600/90 bg-gray-500/50",
    activeClassName: "border-gray-600/95 bg-gray-600/95 text-white",
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
        table.game = checkAndUpdateIfGameEnded(table, true);
      }

      if (table.game.state === "ended") {
        table.players = syncChipCounts(table.game.players, table.players);
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
      // const visible =
      //   playingTable.game.state === "ended" &&
      //   playingTable.game.winnerId === currentPlayer.id;
      const winnerRemoved = !playingTable.game.players.some(
        (item) => item.id === playingTable.game.winnerId && item.isReady,
      );
      const visible =
        playingTable.game.state === "ended" &&
        (winnerRemoved ? playingTable.hostId : playingTable.game.winnerId) ===
          currentPlayer.id;

      return {
        visible,
        disabled: false,
      };
    },
    handleAction(playingTable: Table): Table {
      const cf = window.confirm("Chắc chưa?");
      if (!cf) {
        return playingTable;
      }
      return resetSession(playingTable);
    },
  },

  removePlayers: {
    label: "Xóa người chơi",
    type: "button",
    checkState(
      playingTable: Table,
      curentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        !isGameInProgress(playingTable.game) &&
        playingTable.hostId === curentPlayer.id;
      return { visible, disabled: false };
    },
    handleAction(
      playingTable: Table,
      currentPlayer: GamePlayer,
      data: unknown,
    ): Table {
      if (playingTable.hostId !== currentPlayer.id) return playingTable;

      const { deletingPlayerIds } = data as { deletingPlayerIds: string[] };
      if (deletingPlayerIds.includes(playingTable.hostId)) return playingTable;

      const gamePlayers = playingTable.game.players.filter(
        (item) => !deletingPlayerIds.includes(item.id),
      );

      return {
        ...playingTable,
        game: { ...playingTable.game, players: gamePlayers },
        players: playingTable.players
          .map((item) => ({
            ...item,
            isRemoved: deletingPlayerIds.includes(item.id),
          }))
          .filter((item) => !item.isRemoved || item.chipCount > 0),
      };
    },
  },

  transferHost: {
    label: "Đổi chủ bàn",
    type: "button",
    checkState(
      playingTable: Table,
      curentPlayer: GamePlayer,
    ): { disabled: boolean; visible: boolean } {
      const visible =
        !isGameInProgress(playingTable.game) &&
        playingTable.hostId === curentPlayer.id;
      return { visible, disabled: false };
    },
    handleAction(
      playingTable: Table,
      currentPlayer: GamePlayer,
      data: unknown,
    ): Table {
      if (playingTable.hostId !== currentPlayer.id) return playingTable;

      const { newHostId } = data as { newHostId: string };
      const player = playingTable.game.players.find(
        (item) => item.id === newHostId,
      );
      if (!player) {
        return playingTable;
      }

      return {
        ...playingTable,
        hostId: newHostId,
      };
    },
  },
};

const updateTurnTimes = (game: Game) => {
  const factor = game.state === "handChecking" ? 1.5 : 1;
  game.turnStartTs = Date.now();
  game.turnEndTs = game.turnStartTs + game.turnTimeout * factor * 1000;
};

const evaluateTigers = (game: Game): Game => {
  const { tigers, positive, multiple } = gameHasTigers(game);

  //no tiger: keep the current player turn
  if (!positive) {
    return game;
  }

  let whiteTigers: [number, GamePlayer][] = [];
  let tigerId: string | null = "";

  // has one tiger: make tiger the current player
  if (!multiple) {
    const wr = checkWhiteTiger(tigers[0].cards);
    if (wr === -1) {
      return {
        ...game,
        currentPlayerId: tigers[0].id,
      };
    }
    whiteTigers = [[wr, tigers[0]]];
  } else {
    // check if there are white winners
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
  }

  const sortedGps = rotateGamePlayers(game.players, game.startPlayerId!);
  if (whiteTigers.length === 1) {
    // there is only one white tiger => make it the current player
    tigerId = whiteTigers[0][1].id;
  } else if (whiteTigers.length > 1) {
    // there are multile white tigers => choose the first one after the winner of the last game
    const whiteTigerIds = whiteTigers.map((item) => item[1].id);
    tigerId = sortedGps.find((gp) => whiteTigerIds.includes(gp.id))!.id;
  } else if (whiteTigers.length === 0) {
    // there are multile tigers but no white tiger => choose the first one after the winner of the last game
    const tigerIds = tigers.map((item) => item.id);
    tigerId = sortedGps.find((gp) => tigerIds.includes(gp.id))!.id;
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

const checkAndUpdateIfGameEnded = (
  table: Table,
  handChecking: boolean,
): Game => {
  const game = isGameEnded(table, handChecking);
  if (game.state === "ended") {
    game.winnerId = game.currentPlayerId;
    game.players = calcGameChipCount({ ...table, game }).map((item) => ({
      ...item,
      cards: item.cards.map((card) => ({ ...card, folded: false })),
    }));
  } else if (!handChecking) {
    game.state = "playing";
    game.currentPlayerId = findNextPlayerId(game);
    updateTurnTimes(game);
  }
  return game;
};

const isGameEnded = (table: Table, handChecking: boolean): Game => {
  const game = { ...table.game };
  const gamePlayers = game.players.filter((gp) => gp.isReady);

  const { positive } = gameHasTigers(game);
  if (handChecking) {
    if (positive) {
      const tiger = gamePlayers.find((gp) => gp.id === game.currentPlayerId)!;
      if (checkWhiteTiger(tiger.cards) > -1) {
        game.state = "ended";
        game.playHistory = [
          ...table.game.playHistory,
          {
            playerId: tiger.id,
            cards: tiger.cards.map((item) => {
              const c = { ...item };
              delete c.folded;
              delete c.selected;
              return c;
            }),
            round: game.round,
          },
        ];
        return game;
      }
    }
    return game;
  }

  if (table.bo > 0 && isFourOfAKind(game.lastPlayedCards)) {
    game.state = "ended";
    return game;
  }

  const ended = gamePlayers.some(
    (gp) => gp.cards.length === 0 || (positive && gp.lastAction === "play"),
  );
  if (ended) {
    game.state = "ended";
  }

  return game;
};

const calcGameChipCount = (table: Table): GamePlayer[] => {
  const game = table.game;
  game.players = calcRoundChipCount(table);

  const isBO = table.bo > 0;
  const players = game.players.filter((item) => item.isReady);
  const { targetGamePlayer: winner, opponents } = divideGamePlayers(
    players,
    game.winnerId!,
  );

  const chipChanges: Record<string, number> = players.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: 0 }),
    {},
  );
  let faultPlayerId: string | undefined;

  (() => {
    // BO mode, no need to count the cards
    if (isBO) {
      chipChanges[game.winnerId!] = 1;
      return;
    }

    // tiger checking
    const { tiger, tigerKiller } = findTigerAndKiller(game);
    if (tiger) {
      // has killer, tiger pays killer
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
        return;
      }

      // no killer, everyone pays the tiger
      for (const op of opponents) {
        const chipDeductionLevel =
          tiger.starOfHope && op.starOfHope
            ? ChipDeductionLevel.StarOfHope
            : ChipDeductionLevel.Normal;
        chipChanges[tiger.id] += chipDeductionLevel.Tiger;
        chipChanges[op.id] -= chipDeductionLevel.Tiger;
      }
      return;
    }

    const faultPlayer = findFaultPlayer(game);
    faultPlayerId = faultPlayer?.id;

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
      const opId = faultPlayerId ?? op.id;
      chipChanges[opId] -= value;
    }
  })();

  return game.players.map((gp) => ({
    ...gp,
    chipCount: gp.chipCount + (chipChanges[gp.id] ?? 0),
    paidVillage: gp.id === faultPlayerId,
  }));
};

// den cmn lang
const findFaultPlayer = (game: Game): GamePlayer | null => {
  const lastPlay = game.playHistory.slice(-1)[0];
  if (
    lastPlay.cards.length > 1 ||
    game.players.filter((item) => item.isReady).length === 2
  ) {
    return null;
  }

  const gamePlayers = rotateGamePlayers(
    game.players.filter((item) => item.isReady),
    game.currentPlayerId!,
  );

  const highestRound = Math.max(
    ...gamePlayers.slice(1).map((item) => item.lastPlayedRound),
  );
  const checkingPlayer = gamePlayers[gamePlayers.length - 1];
  if (checkingPlayer.lastPlayedRound !== highestRound) {
    return null;
  }
  if (shouldPayVillage(checkingPlayer.cards, lastPlay.cards)) {
    return checkingPlayer;
  }

  return null;
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

export function findNextAutoPlayer(game: Game, pos = 0): GamePlayer {
  const gamePlayers = rotateGamePlayers(
    game.players.filter((item) => item.isReady),
    game.currentPlayerId!,
  );
  pos = Math.max(pos, 0);
  pos = Math.min(pos, gamePlayers.length - 1);
  return gamePlayers[pos];
}

function isPlayerTurn(game: Game, player: GamePlayer): boolean {
  return (
    game.currentPlayerId === player.id && !isPlayerPassedTurn(game, player)
  );
}

export function isPlayerPassedTurn(game: Game, player: GamePlayer): boolean {
  return player.lastAction === "pass" && player.lastPlayedRound === game.round;
}

function isEveryonePassed(game: Game): boolean {
  const playerActionsInRound = game.players
    .filter(
      (item) =>
        item.isReady &&
        item.lastPlayedRound === game.round &&
        item.id !== game.currentPlayerId,
    )
    .map((item) => item.lastAction);

  const distinctActions = new Set(playerActionsInRound);
  return distinctActions.size === 1 && distinctActions.has("pass");
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
        player.lastAction === "tiger" ||
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
  return game.turnTimeout > 0 && Date.now() - game.turnEndTs >= 0;
}

export function getAutoPlayCards(cards: Card[]): Card[] {
  return getSortedCards(cards, false).slice(-1);
}

function syncChipCounts(
  gamePlayers: GamePlayer[],
  tablePlayers: TablePlayer[],
): TablePlayer[] {
  const chipCounts: Record<string, number> = gamePlayers.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: cur.chipCount }),
    {},
  );
  return tablePlayers.map((item) => ({
    ...item,
    chipCount: chipCounts[item.id] ?? item.chipCount,
    isRemoved: chipCounts[item.id] === undefined,
  }));
}

export const divideGamePlayers = (
  players: GamePlayer[],
  targetPlayerId: string,
): { opponents: GamePlayer[]; targetGamePlayer: GamePlayer } => {
  players = rotateGamePlayers(players, targetPlayerId);
  const targetGamePlayer = players.splice(0, 1)[0];
  const opponents = players;

  return { targetGamePlayer, opponents };
};

export const rotateGamePlayers = (
  players: GamePlayer[],
  targetPlayerId: string,
): GamePlayer[] => {
  players = [...players];
  const targetGPIdx = players.findIndex((item) => item.id === targetPlayerId);
  const movedPlayers = players.splice(0, targetGPIdx);
  return [...players, ...movedPlayers];
};

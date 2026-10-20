import { createDeck, shuffleDeck } from "./deck";
import { t } from "./i18n";
import { randomInt } from "./util";

const SuitOrder: Record<Suit, number> = {
  S: 0,
  C: 1,
  D: 2,
  H: 3,
};

const stripCardMeta = (card: Card): Card => ({
  rank: card.rank,
  suit: card.suit,
  folded: false,
  selected: false,
});

const rotatePlayers = <T extends { id: string }>(
  players: T[],
  targetPlayerId: string,
): T[] => {
  const list = [...players];
  const idx = list.findIndex((p) => p.id === targetPlayerId);
  if (idx <= 0) return list;
  const head = list.splice(0, idx);
  return [...list, ...head];
};

const orderFromLeftOfDealer = (
  players: GamePlayer[],
  dealerId: string | null | undefined,
): GamePlayer[] => {
  if (!dealerId || players.length <= 1) return [...players];
  const idx = players.findIndex((p) => p.id === dealerId);
  if (idx === -1) return [...players];
  const rotated = rotatePlayers(players, dealerId);
  return [...rotated.slice(1), rotated[0]];
};

const updateTurnTimes = (game: Game) => {
  game.turnStartTs = Date.now();
  game.turnEndTs = game.turnStartTs + game.turnTimeout * 1000;
};

export const syncPokerTablePlayers = (
  gamePlayers: GamePlayer[],
  tablePlayers: TablePlayer[],
): TablePlayer[] => {
  const byId: Record<string, GamePlayer> = {};
  for (const gp of gamePlayers) {
    byId[gp.id] = gp;
  }
  return tablePlayers.map((tp) => {
    const gp = byId[tp.id];
    if (!gp) {
      return {
        ...tp,
        isRemoved: true,
      };
    }
    return {
      ...tp,
      chipCount: gp.chipCount,
      stack: gp.stack ?? tp.stack,
      buyIn: gp.buyIn ?? tp.buyIn,
      isRemoved: false,
    };
  });
};

export const getPokerCardValue = (card: Card): number =>
  card.rank === 1 ? 14 : card.rank;

export const getSortedPokerCards = (
  cards: Card[],
  descending: boolean,
): Card[] => {
  const dir = descending ? -1 : 1;
  return [...cards].sort((a, b) => {
    const va = getPokerCardValue(a);
    const vb = getPokerCardValue(b);
    if (va !== vb) {
      return dir * (va - vb);
    }
    return dir * (SuitOrder[a.suit] - SuitOrder[b.suit]);
  });
};

export const evaluateFiveCardHand = (
  five: Card[],
): { score: number[]; category: PokerHandCategory } => {
  const sorted = getSortedPokerCards(five, true);
  const vals = sorted.map(getPokerCardValue);
  const [v0, v1, v2, v3, v4] = vals;

  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  let straightHigh = 0;
  if (
    v0 - v1 === 1 &&
    v1 - v2 === 1 &&
    v2 - v3 === 1 &&
    v3 - v4 === 1
  ) {
    straightHigh = v0;
  } else if (v0 === 14 && v1 === 5 && v2 === 4 && v3 === 3 && v4 === 2) {
    straightHigh = 5;
  }
  const isStraight = straightHigh > 0;

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { category: "royalFlush", score: [8, 14] };
    }
    return { category: "straightFlush", score: [8, straightHigh] };
  }

  const freqMap = new Map<number, number>();
  for (const v of vals) {
    freqMap.set(v, (freqMap.get(v) ?? 0) + 1);
  }
  const groups = Array.from(freqMap.entries())
    .map(([val, count]) => ({ val, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.val - a.val));

  if (groups[0].count === 4) {
    return {
      category: "fourOfAKind",
      score: [7, groups[0].val, groups[1].val],
    };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      category: "fullHouse",
      score: [6, groups[0].val, groups[1].val],
    };
  }

  if (isFlush) {
    return {
      category: "flush",
      score: [5, v0, v1, v2, v3, v4],
    };
  }

  if (isStraight) {
    return {
      category: "straight",
      score: [4, straightHigh],
    };
  }

  if (groups[0].count === 3) {
    return {
      category: "threeOfAKind",
      score: [3, groups[0].val, groups[1].val, groups[2].val],
    };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    return {
      category: "twoPair",
      score: [2, groups[0].val, groups[1].val, groups[2].val],
    };
  }

  if (groups[0].count === 2) {
    return {
      category: "onePair",
      score: [1, groups[0].val, groups[1].val, groups[2].val, groups[3].val],
    };
  }

  return {
    category: "highCard",
    score: [0, v0, v1, v2, v3, v4],
  };
};

export const comparePokerScores = (a: number[], b: number[]): number => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export const evaluatePokerHand = (
  cards: Card[],
): { score: number[]; category: PokerHandCategory; bestFive: Card[] } => {
  const n = cards.length;
  if (n < 5) {
    const sorted = getSortedPokerCards(cards, true).map(stripCardMeta);
    return {
      score: [0, ...sorted.map(getPokerCardValue)],
      category: "highCard",
      bestFive: sorted,
    };
  }

  let bestScore: number[] | null = null;
  let bestCategory: PokerHandCategory = "highCard";
  let bestFive: Card[] = [];

  const pick: Card[] = [];
  const dfs = (start: number) => {
    if (pick.length === 5) {
      const res = evaluateFiveCardHand(pick);
      if (!bestScore || comparePokerScores(res.score, bestScore) > 0) {
        bestScore = res.score;
        bestCategory = res.category;
        bestFive = getSortedPokerCards(pick, true).map(stripCardMeta);
      }
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      dfs(i + 1);
      pick.pop();
    }
  };

  dfs(0);

  return {
    score: bestScore ?? [0],
    category: bestCategory,
    bestFive,
  };
};

export const settlePokerFoldWin = (table: Table, game: Game): Game => {
  const defaultBuyIn = table.buyIn ?? 1000;
  const readyPlayers = game.players.filter((p) => p.isReady);
  const inHand = readyPlayers.filter((p) => !p.foldedHand);
  const winner = inHand[0] ?? readyPlayers[0];
  if (!winner) return game;

  const pot = readyPlayers.reduce((sum, p) => sum + (p.totalBet ?? 0), 0);

  const updatedPlayers = game.players.map((p) => {
    if (!p.isReady) return p;
    const isWinner = p.id === winner.id;
    const nextStack = (p.stack ?? 0) + (isWinner ? pot : 0);
    const buyIn = p.buyIn ?? defaultBuyIn;
    return {
      ...p,
      stack: nextStack,
      buyIn,
      chipCount: nextStack - buyIn,
      streetBet: 0,
      handWonChips: isWinner ? pot : 0,
    };
  });

  return {
    ...game,
    state: "ended",
    pot,
    currentBet: 0,
    pokerWinType: "fold",
    winnerId: winner.id,
    winnerIds: [winner.id],
    currentPlayerId: winner.id,
    players: updatedPlayers,
  };
};

export const settlePokerShowdown = (table: Table, game: Game): Game => {
  const defaultBuyIn = table.buyIn ?? 1000;
  const deck = [...(game.deck ?? [])];
  const communityCards = [...(game.communityCards ?? [])].map(stripCardMeta);

  while (communityCards.length < 5 && deck.length > 0) {
    const nextCard = deck.shift();
    if (nextCard) {
      communityCards.push(stripCardMeta(nextCard));
    }
  }

  const readyPlayers = game.players.filter((p) => p.isReady);

  // Refund any uncalled bet excess before computing contested pots
  const adjustedPlayers = game.players.map((p) => {
    if (!p.isReady) return p;
    const maxOtherBet = Math.max(
      0,
      ...readyPlayers
        .filter((o) => o.id !== p.id)
        .map((o) => o.totalBet ?? 0),
    );
    const myBet = p.totalBet ?? 0;
    if (myBet > maxOtherBet) {
      const excess = myBet - maxOtherBet;
      return {
        ...p,
        stack: (p.stack ?? 0) + excess,
        totalBet: maxOtherBet,
      };
    }
    return p;
  });

  const adjustedReady = adjustedPlayers.filter((p) => p.isReady);
  const contenders = adjustedReady.filter((p) => !p.foldedHand);
  const pot = adjustedReady.reduce((sum, p) => sum + (p.totalBet ?? 0), 0);

  const evalMap: Record<
    string,
    { score: number[]; category: PokerHandCategory; bestFive: Card[] }
  > = {};
  for (const p of contenders) {
    evalMap[p.id] = evaluatePokerHand([...p.cards, ...communityCards]);
  }

  const levels = Array.from(
    new Set(contenders.map((p) => p.totalBet ?? 0).filter((v) => v > 0)),
  ).sort((a, b) => a - b);

  const wonByPlayer: Record<string, number> = {};
  for (const p of adjustedReady) {
    wonByPlayer[p.id] = 0;
  }

  const dealerOrder = orderFromLeftOfDealer(adjustedReady, game.dealerId);
  const dealerRankMap: Record<string, number> = {};
  dealerOrder.forEach((p, idx) => {
    dealerRankMap[p.id] = idx;
  });

  let prevLevel = 0;
  let primaryWinnerIds: string[] = [];

  for (let idx = 0; idx < levels.length; idx++) {
    const level = levels[idx];
    const isTopLevel = idx === levels.length - 1;
    const slicePot = adjustedReady.reduce((sum, p) => {
      const pBet = p.totalBet ?? 0;
      const capped = isTopLevel ? pBet : Math.min(pBet, level);
      return sum + Math.max(0, capped - prevLevel);
    }, 0);

    const eligible = contenders.filter((p) => (p.totalBet ?? 0) >= level);
    if (eligible.length > 0 && slicePot > 0) {
      let bestScore = evalMap[eligible[0].id].score;
      for (let i = 1; i < eligible.length; i++) {
        const sc = evalMap[eligible[i].id].score;
        if (comparePokerScores(sc, bestScore) > 0) {
          bestScore = sc;
        }
      }
      const sliceWinners = eligible
        .filter((p) => comparePokerScores(evalMap[p.id].score, bestScore) === 0)
        .sort(
          (a, b) => (dealerRankMap[a.id] ?? 99) - (dealerRankMap[b.id] ?? 99),
        );

      if (idx === 0) {
        primaryWinnerIds = sliceWinners.map((w) => w.id);
      }

      const share = Math.floor(slicePot / sliceWinners.length);
      const remainder = slicePot % sliceWinners.length;
      sliceWinners.forEach((w, wIdx) => {
        wonByPlayer[w.id] =
          (wonByPlayer[w.id] ?? 0) + share + (wIdx < remainder ? 1 : 0);
      });
    }
    prevLevel = level;
  }

  if (levels.length === 0 && contenders.length > 0) {
    let bestScore = evalMap[contenders[0].id].score;
    for (let i = 1; i < contenders.length; i++) {
      const sc = evalMap[contenders[i].id].score;
      if (comparePokerScores(sc, bestScore) > 0) {
        bestScore = sc;
      }
    }
    primaryWinnerIds = contenders
      .filter((p) => comparePokerScores(evalMap[p.id].score, bestScore) === 0)
      .sort((a, b) => (dealerRankMap[a.id] ?? 99) - (dealerRankMap[b.id] ?? 99))
      .map((w) => w.id);
  }

  const allWinnerIds = contenders
    .filter((p) => (wonByPlayer[p.id] ?? 0) > 0)
    .sort((a, b) => (dealerRankMap[a.id] ?? 99) - (dealerRankMap[b.id] ?? 99))
    .map((p) => p.id);

  const winnerIds =
    allWinnerIds.length > 0 ? allWinnerIds : primaryWinnerIds;
  const winnerId =
    primaryWinnerIds[0] ?? winnerIds[0] ?? contenders[0]?.id ?? null;

  const finalPlayers = adjustedPlayers.map((p) => {
    if (!p.isReady) return p;
    const won = wonByPlayer[p.id] ?? 0;
    const nextStack = (p.stack ?? 0) + won;
    const buyIn = p.buyIn ?? defaultBuyIn;
    const evalRes = evalMap[p.id];
    const unfoldedCards = !p.foldedHand
      ? p.cards.map(stripCardMeta)
      : p.cards;

    return {
      ...p,
      cards: unfoldedCards,
      stack: nextStack,
      buyIn,
      chipCount: nextStack - buyIn,
      streetBet: 0,
      pokerHandRank: evalRes?.category,
      bestHandCards: evalRes?.bestFive,
      handWonChips: won,
    };
  });

  return {
    ...game,
    state: "ended",
    pokerStreet: "showdown",
    pokerWinType: "showdown",
    deck,
    communityCards,
    pot,
    currentBet: 0,
    winnerId,
    winnerIds,
    currentPlayerId: winnerId,
    players: finalPlayers,
  };
};

const isStreetComplete = (game: Game): boolean => {
  const inHand = game.players.filter((p) => p.isReady && !p.foldedHand);
  const ableToAct = inHand.filter((p) => !p.allIn);
  const currentBet = game.currentBet ?? 0;

  if (ableToAct.length === 0) return true;
  if (ableToAct.length === 1) {
    return (ableToAct[0].streetBet ?? 0) >= currentBet;
  }
  return ableToAct.every(
    (p) => p.actedOnStreet && (p.streetBet ?? 0) === currentBet,
  );
};

const findNextActiveActor = (
  players: GamePlayer[],
  fromPlayerId: string,
  includeFrom = false,
): GamePlayer | null => {
  const ready = players.filter((p) => p.isReady);
  if (ready.length === 0) return null;
  const rotated = rotatePlayers(ready, fromPlayerId);
  const startIdx = includeFrom ? 0 : 1;
  for (let i = startIdx; i < rotated.length; i++) {
    const p = rotated[i];
    if (!p.foldedHand && !p.allIn) {
      return p;
    }
  }
  if (!includeFrom && rotated[0] && !rotated[0].foldedHand && !rotated[0].allIn) {
    return rotated[0];
  }
  return null;
};

const advanceTurnOrStreet = (table: Table, game: Game): Table => {
  const defaultBuyIn = table.buyIn ?? 1000;
  const bigBlind = table.bigBlind ?? 10;

  const syncedPlayers = game.players.map((p) => {
    if (!p.isReady) return p;
    const stack = p.stack ?? 0;
    const buyIn = p.buyIn ?? defaultBuyIn;
    return {
      ...p,
      chipCount: stack - buyIn,
    };
  });

  const pot = syncedPlayers
    .filter((p) => p.isReady)
    .reduce((sum, p) => sum + (p.totalBet ?? 0), 0);

  const nextGame: Game = {
    ...game,
    pot,
    players: syncedPlayers,
  };

  const inHand = nextGame.players.filter((p) => p.isReady && !p.foldedHand);

  if (inHand.length <= 1) {
    const endedGame = settlePokerFoldWin(table, nextGame);
    return {
      ...table,
      game: endedGame,
      players: syncPokerTablePlayers(endedGame.players, table.players),
    };
  }

  if (!isStreetComplete(nextGame)) {
    const nextActor = findNextActiveActor(
      nextGame.players,
      nextGame.currentPlayerId ?? inHand[0].id,
      false,
    );
    nextGame.currentPlayerId = nextActor?.id ?? nextGame.currentPlayerId;
    updateTurnTimes(nextGame);
    return {
      ...table,
      game: nextGame,
      players: syncPokerTablePlayers(nextGame.players, table.players),
    };
  }

  const ableToAct = inHand.filter((p) => !p.allIn);
  if (ableToAct.length < 2 || nextGame.pokerStreet === "river") {
    const endedGame = settlePokerShowdown(table, nextGame);
    return {
      ...table,
      game: endedGame,
      players: syncPokerTablePlayers(endedGame.players, table.players),
    };
  }

  const deck = [...(nextGame.deck ?? [])];
  const communityCards = [...(nextGame.communityCards ?? [])];
  let nextStreet: PokerStreet = "flop";
  let cardsToDeal = 0;

  if (nextGame.pokerStreet === "preflop") {
    nextStreet = "flop";
    cardsToDeal = 3;
  } else if (nextGame.pokerStreet === "flop") {
    nextStreet = "turn";
    cardsToDeal = 1;
  } else {
    nextStreet = "river";
    cardsToDeal = 1;
  }

  for (let i = 0; i < cardsToDeal; i++) {
    const c = deck.shift();
    if (c) {
      communityCards.push(stripCardMeta(c));
    }
  }

  const postFlopOrder = orderFromLeftOfDealer(
    nextGame.players.filter((p) => p.isReady),
    nextGame.dealerId,
  );
  const firstPostFlopActor =
    postFlopOrder.find((p) => !p.foldedHand && !p.allIn) ?? ableToAct[0];

  const advancedGame: Game = {
    ...nextGame,
    pokerStreet: nextStreet,
    deck,
    communityCards,
    currentBet: 0,
    minRaise: bigBlind,
    round: (nextGame.round ?? 0) + 1,
    currentPlayerId: firstPostFlopActor?.id ?? null,
    players: nextGame.players.map((p) => ({
      ...p,
      streetBet: 0,
      actedOnStreet: false,
    })),
  };

  updateTurnTimes(advancedGame);
  return {
    ...table,
    game: advancedGame,
    players: syncPokerTablePlayers(advancedGame.players, table.players),
  };
};

export const startPokerGame = (table: Table): Game => {
  const game = table.game;
  const defaultBuyIn = table.buyIn ?? 1000;
  const smallBlind = table.smallBlind ?? 5;
  const bigBlind = table.bigBlind ?? 10;
  const ante = table.ante ?? 0;

  const activePlayers = game.players.filter(
    (p) => p.isReady && (p.stack ?? defaultBuyIn) > 0,
  );
  const maxPlayers = Math.min(table.playerLimit || 6, 9);
  if (activePlayers.length > maxPlayers) {
    throw new Error(t("error.playersExceedLimit"));
  }
  if (activePlayers.length < 2) {
    return game;
  }

  const activeIds = new Set(activePlayers.map((p) => p.id));

  let dealerId: string | null = null;
  const prevDealerId = table.lastGame?.dealerId;
  if (prevDealerId) {
    const allPlayers = game.players;
    const prevIdx = allPlayers.findIndex((p) => p.id === prevDealerId);
    if (prevIdx !== -1) {
      for (let step = 1; step <= allPlayers.length; step++) {
        const candidate = allPlayers[(prevIdx + step) % allPlayers.length];
        if (activeIds.has(candidate.id)) {
          dealerId = candidate.id;
          break;
        }
      }
    }
  }
  if (!dealerId) {
    dealerId = activeIds.has(table.hostId)
      ? table.hostId
      : activePlayers[0].id;
  }

  const orderedActive = rotatePlayers(activePlayers, dealerId);
  let smallBlindId: string;
  let bigBlindId: string;
  let firstToActPreflopId: string;

  if (orderedActive.length === 2) {
    smallBlindId = orderedActive[0].id;
    bigBlindId = orderedActive[1].id;
    firstToActPreflopId = orderedActive[0].id;
  } else {
    smallBlindId = orderedActive[1].id;
    bigBlindId = orderedActive[2].id;
    firstToActPreflopId = (orderedActive[3] ?? orderedActive[0]).id;
  }

  const deck = shuffleDeck(createDeck(), randomInt(3, 10));
  const holeCardsMap: Record<string, Card[]> = {};
  for (const p of orderedActive) {
    holeCardsMap[p.id] = [];
  }
  for (let r = 0; r < 2; r++) {
    for (const p of orderedActive) {
      const card = deck.shift();
      if (card) {
        holeCardsMap[p.id].push({
          rank: card.rank,
          suit: card.suit,
          folded: true,
          selected: false,
        });
      }
    }
  }

  let sbStreetBet = 0;
  let bbStreetBet = 0;

  const initializedPlayers: GamePlayer[] = game.players.map((p) => {
    const isActive = activeIds.has(p.id);
    let stack = p.stack ?? defaultBuyIn;
    const buyIn = p.buyIn ?? defaultBuyIn;

    if (!isActive) {
      return {
        ...p,
        isReady: false,
        cards: [],
        selectedCards: [],
        stack,
        buyIn,
        chipCount: stack - buyIn,
        streetBet: 0,
        totalBet: 0,
        foldedHand: false,
        allIn: false,
        actedOnStreet: false,
        pokerHandRank: undefined,
        bestHandCards: undefined,
        handWonChips: undefined,
        lastAction: null,
        lastPlayedRound: -1,
      };
    }

    const anteAmt = Math.min(stack, Math.max(0, ante));
    stack -= anteAmt;

    let streetBet = 0;
    if (p.id === smallBlindId) {
      streetBet = Math.min(stack, Math.max(0, smallBlind));
      stack -= streetBet;
      sbStreetBet = streetBet;
    } else if (p.id === bigBlindId) {
      streetBet = Math.min(stack, Math.max(0, bigBlind));
      stack -= streetBet;
      bbStreetBet = streetBet;
    }

    const totalBet = anteAmt + streetBet;
    const allIn = stack === 0;

    return {
      ...p,
      isReady: true,
      cards: holeCardsMap[p.id] ?? [],
      selectedCards: [],
      stack,
      buyIn,
      chipCount: stack - buyIn,
      streetBet,
      totalBet,
      foldedHand: false,
      allIn,
      actedOnStreet: false,
      pokerHandRank: undefined,
      bestHandCards: undefined,
      handWonChips: undefined,
      paidVillage: false,
      lastAction: null,
      lastPlayedRound: 0,
    };
  });

  const pot = initializedPlayers
    .filter((p) => p.isReady)
    .reduce((sum, p) => sum + (p.totalBet ?? 0), 0);
  const currentBet = Math.max(sbStreetBet, bbStreetBet);
  const firstActor = findNextActiveActor(
    initializedPlayers,
    firstToActPreflopId,
    true,
  );

  const startingGame: Game = {
    ...game,
    state: "playing",
    startedAt: Date.now(),
    round: 1,
    pokerStreet: "preflop",
    pokerWinType: null,
    winnerId: null,
    winnerIds: [],
    dealerId,
    smallBlindId,
    bigBlindId,
    currentPlayerId: firstActor?.id ?? firstToActPreflopId,
    startPlayerId: firstActor?.id ?? firstToActPreflopId,
    deck,
    communityCards: [],
    pot,
    currentBet,
    minRaise: bigBlind,
    lastPlayedCards: [],
    playHistory: [],
    players: initializedPlayers,
  };

  if (isStreetComplete(startingGame)) {
    return settlePokerShowdown(
      { ...table, game: startingGame },
      startingGame,
    );
  }

  updateTurnTimes(startingGame);
  return startingGame;
};

export const isPokerPlayerTurn = (game: Game, player: GamePlayer): boolean => {
  return (
    game.state === "playing" &&
    game.currentPlayerId === player.id &&
    player.isReady &&
    !player.foldedHand &&
    !player.allIn
  );
};

export const canFold = (game: Game, player: GamePlayer): boolean => {
  return isPokerPlayerTurn(game, player);
};

export const handleFold = (table: Table, player: GamePlayer): Table => {
  const game = table.game;
  if (!canFold(game, player)) return table;

  const nextGame: Game = {
    ...game,
    playHistory: [
      ...game.playHistory,
      { playerId: player.id, cards: [], round: game.round },
    ],
    players: game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        foldedHand: true,
        actedOnStreet: true,
        lastAction: "fold",
        lastPlayedRound: game.round,
        selectedCards: [],
      };
    }),
  };

  return advanceTurnOrStreet(table, nextGame);
};

export const canCheck = (game: Game, player: GamePlayer): boolean => {
  return (
    isPokerPlayerTurn(game, player) &&
    (player.streetBet ?? 0) >= (game.currentBet ?? 0)
  );
};

export const handleCheck = (table: Table, player: GamePlayer): Table => {
  const game = table.game;
  if (!canCheck(game, player)) return table;

  const nextGame: Game = {
    ...game,
    playHistory: [
      ...game.playHistory,
      { playerId: player.id, cards: [], round: game.round },
    ],
    players: game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        actedOnStreet: true,
        lastAction: "check",
        lastPlayedRound: game.round,
        selectedCards: [],
      };
    }),
  };

  return advanceTurnOrStreet(table, nextGame);
};

export const getCallAmount = (game: Game, player: GamePlayer): number => {
  const diff = Math.max(0, (game.currentBet ?? 0) - (player.streetBet ?? 0));
  return Math.min(player.stack ?? 0, diff);
};

export const canCall = (game: Game, player: GamePlayer): boolean => {
  return (
    isPokerPlayerTurn(game, player) &&
    (player.streetBet ?? 0) < (game.currentBet ?? 0) &&
    (player.stack ?? 0) > 0
  );
};

export const handleCall = (table: Table, player: GamePlayer): Table => {
  const game = table.game;
  if (!canCall(game, player)) return table;

  const callAmt = getCallAmount(game, player);
  const nextStack = (player.stack ?? 0) - callAmt;
  const nextStreetBet = (player.streetBet ?? 0) + callAmt;
  const nextTotalBet = (player.totalBet ?? 0) + callAmt;
  const isAllIn = nextStack === 0;

  const nextGame: Game = {
    ...game,
    playHistory: [
      ...game.playHistory,
      { playerId: player.id, cards: [], round: game.round },
    ],
    players: game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        stack: nextStack,
        streetBet: nextStreetBet,
        totalBet: nextTotalBet,
        allIn: isAllIn,
        actedOnStreet: true,
        lastAction: "call",
        lastPlayedRound: game.round,
        selectedCards: [],
      };
    }),
  };

  return advanceTurnOrStreet(table, nextGame);
};

export const getRaiseBounds = (
  table: Table,
  player: GamePlayer,
): { canRaise: boolean; minTotalBet: number; maxTotalBet: number } => {
  const game = table.game;
  const bigBlind = table.bigBlind ?? 10;
  const currentBet = game.currentBet ?? 0;
  const playerStreetBet = player.streetBet ?? 0;
  const playerStack = player.stack ?? 0;

  const callDiff = Math.max(0, currentBet - playerStreetBet);
  const maxTotalBet = playerStreetBet + playerStack;
  const minRaiseIncrement = Math.max(bigBlind, game.minRaise ?? bigBlind);
  const minRaiseTarget =
    currentBet === 0 ? bigBlind : currentBet + minRaiseIncrement;
  const minTotalBet = Math.min(maxTotalBet, minRaiseTarget);
  const canRaiseNow =
    isPokerPlayerTurn(game, player) && playerStack > callDiff;

  return {
    canRaise: canRaiseNow,
    minTotalBet,
    maxTotalBet,
  };
};

export const canRaise = (
  table: Table,
  player: GamePlayer,
  targetStreetBet?: number,
): boolean => {
  const bounds = getRaiseBounds(table, player);
  if (!bounds.canRaise) return false;
  if (targetStreetBet !== undefined) {
    return (
      Number.isFinite(targetStreetBet) &&
      targetStreetBet >= bounds.minTotalBet &&
      targetStreetBet <= bounds.maxTotalBet
    );
  }
  return true;
};

export const handleRaise = (
  table: Table,
  player: GamePlayer,
  targetStreetBet?: number,
): Table => {
  const game = table.game;
  const bounds = getRaiseBounds(table, player);
  if (!bounds.canRaise) return table;

  const rawTarget =
    typeof targetStreetBet === "number" && Number.isFinite(targetStreetBet)
      ? Math.floor(targetStreetBet)
      : bounds.minTotalBet;
  const target = Math.max(
    bounds.minTotalBet,
    Math.min(bounds.maxTotalBet, rawTarget),
  );

  const playerStreetBet = player.streetBet ?? 0;
  const added = target - playerStreetBet;
  const nextStack = (player.stack ?? 0) - added;
  const nextTotalBet = (player.totalBet ?? 0) + added;
  const isAllIn = nextStack === 0;

  const prevBet = game.currentBet ?? 0;
  const bigBlind = table.bigBlind ?? 10;
  const prevMinRaise = game.minRaise ?? bigBlind;
  const raiseDiff = target - prevBet;
  const isFullRaise = prevBet === 0 || raiseDiff >= prevMinRaise;

  const nextGame: Game = {
    ...game,
    currentBet: target,
    minRaise: isFullRaise ? Math.max(bigBlind, raiseDiff) : prevMinRaise,
    playHistory: [
      ...game.playHistory,
      { playerId: player.id, cards: [], round: game.round },
    ],
    players: game.players.map((gp) => {
      if (gp.id === player.id) {
        return {
          ...gp,
          stack: nextStack,
          streetBet: target,
          totalBet: nextTotalBet,
          allIn: isAllIn,
          actedOnStreet: true,
          lastAction: "raise",
          lastPlayedRound: game.round,
          selectedCards: [],
        };
      }
      if (!gp.isReady || gp.foldedHand || gp.allIn) {
        return gp;
      }
      if (isFullRaise || (gp.streetBet ?? 0) < target) {
        return {
          ...gp,
          actedOnStreet: false,
        };
      }
      return gp;
    }),
  };

  return advanceTurnOrStreet(table, nextGame);
};

export const getPokerPossibleActions = (
  table: Table,
  player: GamePlayer,
): PlayerAction[] => {
  const game = table.game;
  if (!isPokerPlayerTurn(game, player)) return [];

  const actions: PlayerAction[] = ["fold"];
  if (canCheck(game, player)) {
    actions.push("check");
  }
  if (canCall(game, player)) {
    actions.push("call");
  }
  if (canRaise(table, player)) {
    actions.push("raise");
  }
  return actions;
};

export const handlePokerAutoAction = (
  table: Table,
  player: GamePlayer,
): Table => {
  const currentPlayer =
    table.game.players.find((p) => p.id === player.id) ?? player;
  if (canCheck(table.game, currentPlayer)) {
    return handleCheck(table, currentPlayer);
  }
  return handleFold(table, currentPlayer);
};

export const handleUpdatePokerConfig = (
  table: Table,
  player: GamePlayer,
  data: { smallBlind: number; bigBlind: number; ante: number },
): Table => {
  if (
    table.hostId !== player.id ||
    table.game.state === "playing" ||
    table.game.state === "handChecking"
  ) {
    return table;
  }

  const smallBlind = Math.floor(Number(data?.smallBlind));
  const bigBlind = Math.floor(Number(data?.bigBlind));
  const ante = Math.floor(Number(data?.ante ?? 0));

  if (
    !Number.isFinite(smallBlind) ||
    !Number.isFinite(bigBlind) ||
    !Number.isFinite(ante) ||
    smallBlind < 1 ||
    bigBlind < smallBlind ||
    ante < 0
  ) {
    return table;
  }

  if (table.pokerMode === "tournament") {
    const curSb = table.smallBlind ?? 5;
    const curBb = table.bigBlind ?? 10;
    const curAnte = table.ante ?? 0;
    if (smallBlind < curSb || bigBlind < curBb || ante < curAnte) {
      return table;
    }
  }

  return {
    ...table,
    smallBlind,
    bigBlind,
    ante,
  };
};

export const handleAddPokerChips = (
  table: Table,
  player: GamePlayer,
  data: { targetPlayerId: string; amount: number },
): Table => {
  if (
    table.hostId !== player.id ||
    table.pokerMode === "tournament" ||
    table.game.state === "playing" ||
    table.game.state === "handChecking"
  ) {
    return table;
  }

  const amount = Math.floor(Number(data?.amount));
  const targetPlayerId = data?.targetPlayerId;
  if (!targetPlayerId || !Number.isInteger(amount) || amount <= 0) {
    return table;
  }

  const defaultBuyIn = table.buyIn ?? 1000;
  const updatedGamePlayers = table.game.players.map((gp) => {
    if (gp.id !== targetPlayerId) return gp;
    const nextStack = (gp.stack ?? defaultBuyIn) + amount;
    const nextBuyIn = (gp.buyIn ?? defaultBuyIn) + amount;
    return {
      ...gp,
      stack: nextStack,
      buyIn: nextBuyIn,
      chipCount: nextStack - nextBuyIn,
    };
  });

  return {
    ...table,
    game: {
      ...table.game,
      players: updatedGamePlayers,
    },
    players: syncPokerTablePlayers(updatedGamePlayers, table.players),
  };
};

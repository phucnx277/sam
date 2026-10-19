import { areCardsEqual } from "./card";
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
});

const popcount = (mask: number): number => {
  let count = 0;
  let m = mask;
  while (m > 0) {
    m &= m - 1;
    count++;
  }
  return count;
};

const rotateReadyPlayers = (
  players: GamePlayer[],
  targetPlayerId: string,
): GamePlayer[] => {
  const list = [...players];
  const idx = list.findIndex((p) => p.id === targetPlayerId);
  if (idx <= 0) return list;
  const head = list.splice(0, idx);
  return [...list, ...head];
};

const updateTurnTimes = (game: Game) => {
  game.turnStartTs = Date.now();
  game.turnEndTs = game.turnStartTs + game.turnTimeout * 1000;
};

const syncChipCounts = (
  gamePlayers: GamePlayer[],
  tablePlayers: TablePlayer[],
): TablePlayer[] => {
  const chipCounts: Record<string, number> = gamePlayers.reduce(
    (prev, cur) => ({ ...prev, [cur.id]: cur.chipCount }),
    {},
  );
  return tablePlayers.map((item) => ({
    ...item,
    chipCount: chipCounts[item.id] ?? item.chipCount,
    isRemoved: chipCounts[item.id] === undefined,
  }));
};

export const getPhomCardPoint = (card: Card): number => card.rank;

export const getSortedPhomCards = (
  cards: Card[],
  descending: boolean,
): Card[] => {
  const dir = descending ? -1 : 1;
  return [...cards].sort((a, b) => {
    if (a.rank !== b.rank) {
      return dir * (a.rank - b.rank);
    }
    return dir * (SuitOrder[a.suit] - SuitOrder[b.suit]);
  });
};

export const isPhomSet = (cards: Card[]): boolean => {
  if (cards.length < 3 || cards.length > 4) return false;
  const firstRank = cards[0].rank;
  const suits = new Set<Suit>();
  for (const c of cards) {
    if (c.rank !== firstRank) return false;
    suits.add(c.suit);
  }
  return suits.size === cards.length;
};

export const isPhomRun = (cards: Card[]): boolean => {
  if (cards.length < 3) return false;
  const firstSuit = cards[0].suit;
  for (const c of cards) {
    if (c.suit !== firstSuit) return false;
  }
  const sorted = getSortedPhomCards(cards, false);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].rank !== sorted[i - 1].rank + 1) {
      return false;
    }
  }
  return true;
};

export const isValidPhom = (cards: Card[]): boolean => {
  return isPhomSet(cards) || isPhomRun(cards);
};

export const getSortedPhom = (cards: Card[]): Card[] => {
  return getSortedPhomCards(cards, false);
};

export const isUkhan = (cards: Card[]): boolean => {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      if (a.rank === b.rank) return false;
      if (a.suit === b.suit && Math.abs(a.rank - b.rank) <= 2) {
        return false;
      }
    }
  }
  return true;
};

type PhomSubset = {
  mask: number;
  cards: Card[];
};

const getValidPhomSubsets = (
  hand: Card[],
  eatenMask: number,
): PhomSubset[] => {
  const n = hand.length;
  const total = 1 << n;
  const results: PhomSubset[] = [];

  for (let mask = 0; mask < total; mask++) {
    if (popcount(mask) < 3) continue;
    if (popcount(mask & eatenMask) > 1) continue;
    const subset: Card[] = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) {
        subset.push(stripCardMeta(hand[i]));
      }
    }
    if (isValidPhom(subset)) {
      results.push({ mask, cards: getSortedPhom(subset) });
    }
  }

  return results;
};

const computeEatenMask = (
  hand: Card[],
  eatenCards: Card[],
): { valid: boolean; eatenMask: number; eatenBits: number[] } => {
  let eatenMask = 0;
  const eatenBits: number[] = [];

  for (const ec of eatenCards) {
    const idx = hand.findIndex(
      (hc, i) => (eatenMask & (1 << i)) === 0 && areCardsEqual(hc, ec),
    );
    if (idx === -1) {
      return { valid: false, eatenMask: 0, eatenBits: [] };
    }
    const bit = 1 << idx;
    eatenMask |= bit;
    eatenBits.push(bit);
  }

  return { valid: true, eatenMask, eatenBits };
};

export const canCoverEatenCards = (
  hand: Card[],
  eatenCards: Card[],
): boolean => {
  if (eatenCards.length === 0) return true;
  const { valid, eatenMask, eatenBits } = computeEatenMask(hand, eatenCards);
  if (!valid) return false;

  const phoms = getValidPhomSubsets(hand, eatenMask);

  const dfs = (eatenIdx: number, usedMask: number): boolean => {
    if (eatenIdx >= eatenBits.length) return true;
    const targetBit = eatenBits[eatenIdx];
    for (const p of phoms) {
      if ((p.mask & targetBit) !== 0 && (p.mask & usedMask) === 0) {
        if (dfs(eatenIdx + 1, usedMask | p.mask)) {
          return true;
        }
      }
    }
    return false;
  };

  return dfs(0, 0);
};

export const canEatCard = (
  hand: Card[],
  eatenCards: Card[],
  card: Card,
): boolean => {
  const cleanCard = stripCardMeta(card);
  return canCoverEatenCards(
    [...hand, cleanCard],
    [...eatenCards, cleanCard],
  );
};

const partitionSelectedMelds = (
  selectedCards: Card[],
  eatenCards: Card[],
): Card[][] | null => {
  if (selectedCards.length < 3) return null;
  const eatenInSelected = selectedCards.filter((sc) =>
    eatenCards.some((ec) => areCardsEqual(sc, ec)),
  );
  const { valid, eatenMask } = computeEatenMask(selectedCards, eatenInSelected);
  if (!valid) return null;

  const phoms = getValidPhomSubsets(selectedCards, eatenMask);
  const fullMask = (1 << selectedCards.length) - 1;

  const dfs = (
    startIdx: number,
    usedMask: number,
    chosen: Card[][],
  ): Card[][] | null => {
    if (usedMask === fullMask) {
      return chosen;
    }
    for (let i = startIdx; i < phoms.length; i++) {
      const p = phoms[i];
      if ((p.mask & usedMask) === 0) {
        const res = dfs(i + 1, usedMask | p.mask, [...chosen, p.cards]);
        if (res) return res;
      }
    }
    return null;
  };

  return dfs(0, 0, []);
};

export const findUPartition = (
  hand: Card[],
  eatenCards: Card[],
  existingMeldsCount: number,
): { melds: Card[][]; discard: Card | null } | null => {
  const { valid, eatenMask } = computeEatenMask(hand, eatenCards);
  if (!valid) return null;

  if (hand.length === 0) {
    return existingMeldsCount >= 1 ? { melds: [], discard: null } : null;
  }

  const phoms = getValidPhomSubsets(hand, eatenMask);
  const fullMask = (1 << hand.length) - 1;

  let bestZeroLeftover: { melds: Card[][]; discard: Card | null } | null = null;
  let bestOneLeftover: { melds: Card[][]; discard: Card | null } | null = null;

  const evaluate = (usedMask: number, chosen: Card[][]) => {
    if ((usedMask & eatenMask) !== eatenMask) return;
    if (existingMeldsCount + chosen.length < 1) return;
    const leftoverCount = hand.length - popcount(usedMask);
    if (leftoverCount === 0 && !bestZeroLeftover) {
      bestZeroLeftover = { melds: chosen, discard: null };
    } else if (leftoverCount === 1 && !bestOneLeftover) {
      const leftoverMask = fullMask ^ usedMask;
      let discard: Card | null = null;
      for (let i = 0; i < hand.length; i++) {
        if ((leftoverMask & (1 << i)) !== 0) {
          discard = stripCardMeta(hand[i]);
          break;
        }
      }
      bestOneLeftover = { melds: chosen, discard };
    }
  };

  const dfs = (startIdx: number, usedMask: number, chosen: Card[][]) => {
    if (bestZeroLeftover) return;
    evaluate(usedMask, chosen);
    for (let i = startIdx; i < phoms.length; i++) {
      const p = phoms[i];
      if ((p.mask & usedMask) === 0) {
        dfs(i + 1, usedMask | p.mask, [...chosen, p.cards]);
        if (bestZeroLeftover) return;
      }
    }
  };

  dfs(0, 0, []);
  return bestZeroLeftover ?? bestOneLeftover;
};

export const shiftDiscardsOnEat = (
  readyPlayers: GamePlayer[],
  startPlayerId: string,
  feederId: string,
): GamePlayer[] => {
  const rotated = rotateReadyPlayers(readyPlayers, startPlayerId).map((p) => ({
    ...p,
    discards: [...(p.discards ?? [])],
  }));
  const n = rotated.length;
  const feederIdx = rotated.findIndex((p) => p.id === feederId);
  if (feederIdx === -1 || n <= 1) return readyPlayers;

  const feederOldCount = rotated[feederIdx].discards.length + 1;
  const chain: number[] = [];

  for (let step = 1; step < n; step++) {
    const prevIdx = (feederIdx - step + n) % n;
    if (rotated[prevIdx].discards.length === feederOldCount) {
      chain.unshift(prevIdx);
    } else {
      break;
    }
  }

  for (let k = chain.length - 1; k >= 0; k--) {
    const fromIdx = chain[k];
    const toIdx = k === chain.length - 1 ? feederIdx : chain[k + 1];
    const movedCard = rotated[fromIdx].discards.pop();
    if (movedCard) {
      rotated[toIdx].discards.push(movedCard);
    }
  }

  const byId: Record<string, GamePlayer> = {};
  for (const p of rotated) {
    byId[p.id] = p;
  }
  return readyPlayers.map((p) => byId[p.id] ?? p);
};

export const isMeldRound = (player: GamePlayer): boolean => {
  return (player.discards?.length ?? 0) >= 3 || !!player.hasMelded;
};

const settleUChips = (
  players: GamePlayer[],
  winnerId: string,
  multiplier: number,
  faultPlayerId?: string | null,
): GamePlayer[] => {
  const readyPlayers = players.filter((p) => p.isReady);
  const chipChanges: Record<string, number> = {};
  for (const p of readyPlayers) {
    chipChanges[p.id] = 0;
  }

  if (faultPlayerId) {
    const penalty = 15 * multiplier;
    chipChanges[winnerId] = (chipChanges[winnerId] ?? 0) + penalty;
    chipChanges[faultPlayerId] = (chipChanges[faultPlayerId] ?? 0) - penalty;
  } else {
    const perLoser = 5 * multiplier;
    for (const p of readyPlayers) {
      if (p.id === winnerId) continue;
      chipChanges[winnerId] += perLoser;
      chipChanges[p.id] -= perLoser;
    }
  }

  return players.map((p) => ({
    ...p,
    chipCount: p.chipCount + (chipChanges[p.id] ?? 0),
    paidVillage: faultPlayerId ? p.id === faultPlayerId : false,
    cards: p.cards.map((c) => ({ ...c, folded: false })),
  }));
};

const finishWithU = (
  table: Table,
  winnerId: string,
  winType: PhomWinType,
  faultPlayerId?: string | null,
): Table => {
  const multiplier = table.multiplier ?? 10;
  const resolvedWinType: PhomWinType = faultPlayerId ? "uDen" : winType;
  const updatedPlayers = settleUChips(
    table.game.players,
    winnerId,
    multiplier,
    faultPlayerId,
  );
  const endedGame: Game = {
    ...table.game,
    state: "ended",
    winnerId,
    currentPlayerId: winnerId,
    phomWinType: resolvedWinType,
    lastPlayedCards: [],
    lastDiscardBy: null,
    lastDiscardIsChot: false,
    players: updatedPlayers,
  };
  return {
    ...table,
    game: endedGame,
    players: syncChipCounts(endedGame.players, table.players),
  };
};

export const startPhomGame = (
  game: Game,
  playerLimit: number,
  hostId: string,
  multiplier: number,
): Game => {
  const readyPlayers = game.players.filter((p) => p.isReady);
  const maxPlayers = Math.min(playerLimit || 4, 4);
  if (readyPlayers.length > maxPlayers) {
    throw new Error(t("error.playersExceedLimit"));
  }

  let startPlayerId = game.currentPlayerId;
  if (!startPlayerId || !readyPlayers.some((p) => p.id === startPlayerId)) {
    startPlayerId = readyPlayers.some((p) => p.id === hostId)
      ? hostId
      : (readyPlayers[0]?.id ?? null);
  }

  const orderedReady = rotateReadyPlayers(readyPlayers, startPlayerId!);
  const deck = shuffleDeck(createDeck(), randomInt(3, 10));
  const handsMap: Record<string, Card[]> = {};
  for (const p of orderedReady) {
    handsMap[p.id] = [];
  }

  for (let i = 0; i < 9; i++) {
    for (const p of orderedReady) {
      const card = deck.shift();
      if (card) {
        handsMap[p.id].push(card);
      }
    }
  }
  const tenthCard = deck.shift();
  if (tenthCard && orderedReady[0]) {
    handsMap[orderedReady[0].id].push(tenthCard);
  }

  const initializedPlayers: GamePlayer[] = game.players.map((p) => ({
    ...p,
    cards: p.isReady ? (handsMap[p.id] ?? []) : [],
    selectedCards: [],
    eatenCards: [],
    discards: [],
    melds: [],
    hasMelded: false,
    meldOrder: 0,
    eatenCount: 0,
    isMom: false,
    score: undefined,
    paidVillage: false,
    lastAction: null,
    lastPlayedRound: 0,
  }));

  const uKhanWinner = orderedReady.find((p) => isUkhan(handsMap[p.id]));
  if (uKhanWinner) {
    const settledPlayers = settleUChips(
      initializedPlayers,
      uKhanWinner.id,
      multiplier,
      null,
    );
    return {
      ...game,
      state: "ended",
      startedAt: Date.now(),
      round: 1,
      currentPlayerId: uKhanWinner.id,
      startPlayerId,
      winnerId: uKhanWinner.id,
      phomWinType: "uKhan",
      phomPhase: "discard",
      deck,
      lastPlayedCards: [],
      lastDiscardBy: null,
      lastDiscardIsChot: false,
      players: settledPlayers,
    };
  }

  const startingGame: Game = {
    ...game,
    state: "playing",
    startedAt: Date.now(),
    round: 1,
    currentPlayerId: startPlayerId,
    startPlayerId,
    winnerId: null,
    phomWinType: null,
    phomPhase: "discard",
    deck,
    lastPlayedCards: [],
    lastDiscardBy: null,
    lastDiscardIsChot: false,
    players: initializedPlayers,
  };
  updateTurnTimes(startingGame);
  return startingGame;
};

export const canDraw = (game: Game, player: GamePlayer): boolean => {
  return (
    game.state === "playing" &&
    game.currentPlayerId === player.id &&
    game.phomPhase === "take" &&
    (game.deck?.length ?? 0) > 0
  );
};

export const handleDraw = (table: Table, player: GamePlayer): Table => {
  if (!canDraw(table.game, player)) return table;
  const deck = [...(table.game.deck ?? [])];
  const drawnCard = deck.shift();
  if (!drawnCard) return table;

  const nextPhase: PhomPhase = isMeldRound(player) ? "meld" : "discard";
  const nextGame: Game = {
    ...table.game,
    deck,
    phomPhase: nextPhase,
    lastPlayedCards: [],
    lastDiscardBy: null,
    lastDiscardIsChot: false,
    players: table.game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        cards: [...gp.cards, stripCardMeta(drawnCard)],
        selectedCards: [],
      };
    }),
  };
  updateTurnTimes(nextGame);
  return {
    ...table,
    game: nextGame,
  };
};

export const canEat = (game: Game, player: GamePlayer): boolean => {
  return (
    game.state === "playing" &&
    game.currentPlayerId === player.id &&
    game.phomPhase === "take" &&
    game.lastPlayedCards.length === 1 &&
    !!game.lastDiscardBy &&
    canEatCard(
      player.cards,
      player.eatenCards ?? [],
      game.lastPlayedCards[0],
    )
  );
};

export const handleEat = (table: Table, player: GamePlayer): Table => {
  const game = table.game;
  if (!canEat(game, player)) return table;

  const eatenCard = stripCardMeta(game.lastPlayedCards[0]);
  const feederId = game.lastDiscardBy!;
  const multiplier = table.multiplier ?? 10;
  const newEatenCount = (player.eatenCount ?? 0) + 1;
  const eatBonus =
    newEatenCount < 3
      ? (game.lastDiscardIsChot ? 4 : newEatenCount === 1 ? 1 : 2) * multiplier
      : 0;

  const feeder = game.players.find((p) => p.id === feederId);
  const feederHadMelded = !!feeder?.hasMelded;

  const playersWithPoppedDiscard = game.players.map((gp) => {
    if (gp.id !== feederId) return gp;
    const nextDiscards = [...(gp.discards ?? [])];
    nextDiscards.pop();
    return {
      ...gp,
      discards: nextDiscards,
      chipCount: gp.chipCount - eatBonus,
    };
  });

  const readyPlayers = playersWithPoppedDiscard.filter((p) => p.isReady);
  const shiftedReady = shiftDiscardsOnEat(
    readyPlayers,
    game.startPlayerId!,
    feederId,
  );
  const shiftedById: Record<string, GamePlayer> = {};
  for (const rp of shiftedReady) {
    shiftedById[rp.id] = rp;
  }

  let updatedCurrentPlayer: GamePlayer = player;
  const updatedPlayers = playersWithPoppedDiscard.map((gp) => {
    const base = shiftedById[gp.id] ?? gp;
    if (base.id !== player.id) return base;
    updatedCurrentPlayer = {
      ...base,
      cards: [...base.cards, eatenCard],
      eatenCards: [...(base.eatenCards ?? []), eatenCard],
      eatenCount: newEatenCount,
      chipCount: base.chipCount + eatBonus,
      selectedCards: [],
    };
    return updatedCurrentPlayer;
  });

  const nextPhase: PhomPhase = isMeldRound(updatedCurrentPlayer)
    ? "meld"
    : "discard";

  const nextGame: Game = {
    ...game,
    phomPhase: nextPhase,
    lastPlayedCards: [],
    lastDiscardBy: feederHadMelded ? feederId : null,
    lastDiscardIsChot: false,
    players: updatedPlayers,
  };

  if (newEatenCount >= 3) {
    return finishWithU(
      { ...table, game: nextGame },
      player.id,
      "uDen",
      feederId,
    );
  }

  updateTurnTimes(nextGame);
  return {
    ...table,
    game: nextGame,
    players: syncChipCounts(nextGame.players, table.players),
  };
};

export const canMeld = (
  game: Game,
  player: GamePlayer,
  selectedCards: Card[],
): boolean => {
  if (
    game.state !== "playing" ||
    game.currentPlayerId !== player.id ||
    (game.phomPhase !== "meld" && game.phomPhase !== "discard") ||
    !isMeldRound(player)
  ) {
    return false;
  }
  const partitioned = partitionSelectedMelds(
    selectedCards,
    player.eatenCards ?? [],
  );
  if (!partitioned || partitioned.length === 0) return false;

  const remainingCards = player.cards.filter(
    (c) => !selectedCards.some((sc) => areCardsEqual(c, sc)),
  );
  const remainingEaten = (player.eatenCards ?? []).filter(
    (ec) => !selectedCards.some((sc) => areCardsEqual(ec, sc)),
  );
  return canCoverEatenCards(remainingCards, remainingEaten);
};

export const handleMeld = (
  table: Table,
  player: GamePlayer,
  selectedCards: Card[],
): Table => {
  const game = table.game;
  if (!canMeld(game, player, selectedCards)) return table;

  const partitioned = partitionSelectedMelds(
    selectedCards,
    player.eatenCards ?? [],
  );
  if (!partitioned) return table;

  const remainingCards = player.cards.filter(
    (c) => !selectedCards.some((sc) => areCardsEqual(c, sc)),
  );
  const remainingEaten = (player.eatenCards ?? []).filter(
    (ec) => !selectedCards.some((sc) => areCardsEqual(ec, sc)),
  );

  const maxMeldOrder = Math.max(
    0,
    ...game.players.map((p) => p.meldOrder ?? 0),
  );

  const nextGame: Game = {
    ...game,
    playHistory: [
      ...game.playHistory,
      ...partitioned.map((meld) => ({
        playerId: player.id,
        cards: meld,
        round: game.round,
      })),
    ],
    players: game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        cards: remainingCards,
        eatenCards: remainingEaten,
        melds: [...(gp.melds ?? []), ...partitioned],
        hasMelded: true,
        meldOrder: gp.meldOrder || maxMeldOrder + 1,
        selectedCards: [],
      };
    }),
  };

  if (remainingCards.length === 0) {
    const meldedFeederId =
      game.lastPlayedCards.length === 0 ? game.lastDiscardBy : null;
    return finishWithU(
      { ...table, game: nextGame },
      player.id,
      "uTron",
      meldedFeederId,
    );
  }

  updateTurnTimes(nextGame);
  return {
    ...table,
    game: nextGame,
  };
};

export const findSendTarget = (
  game: Game,
  selectedCards: Card[],
): { targetPlayerId: string; meldIdx: number; newMeld: Card[] } | null => {
  if (selectedCards.length === 0) return null;
  const cleanSelected = selectedCards.map(stripCardMeta);
  const readyPlayers = game.players.filter((p) => p.isReady);

  for (const p of readyPlayers) {
    const melds = p.melds ?? [];
    for (let idx = 0; idx < melds.length; idx++) {
      const combined = [...melds[idx], ...cleanSelected];
      if (isValidPhom(combined)) {
        return {
          targetPlayerId: p.id,
          meldIdx: idx,
          newMeld: getSortedPhom(combined),
        };
      }
    }
  }

  return null;
};

export const canSend = (
  game: Game,
  player: GamePlayer,
  selectedCards: Card[],
): boolean => {
  if (
    game.state !== "playing" ||
    game.currentPlayerId !== player.id ||
    (game.phomPhase !== "meld" && game.phomPhase !== "discard") ||
    !isMeldRound(player)
  ) {
    return false;
  }
  if ((player.melds?.length ?? 0) === 0 || (player.eatenCards?.length ?? 0) > 0) {
    return false;
  }
  if (selectedCards.length === 0) return false;
  if (
    selectedCards.some((sc) =>
      (player.eatenCards ?? []).some((ec) => areCardsEqual(sc, ec)),
    )
  ) {
    return false;
  }
  return findSendTarget(game, selectedCards) !== null;
};

export const handleSend = (
  table: Table,
  player: GamePlayer,
  selectedCards: Card[],
): Table => {
  const game = table.game;
  if (!canSend(game, player, selectedCards)) return table;

  const target = findSendTarget(game, selectedCards);
  if (!target) return table;

  const remainingCards = player.cards.filter(
    (c) => !selectedCards.some((sc) => areCardsEqual(c, sc)),
  );

  const nextGame: Game = {
    ...game,
    players: game.players.map((gp) => {
      let updated = gp;
      if (gp.id === target.targetPlayerId) {
        const nextMelds = [...(gp.melds ?? [])];
        nextMelds[target.meldIdx] = target.newMeld;
        updated = {
          ...updated,
          melds: nextMelds,
        };
      }
      if (gp.id === player.id) {
        updated = {
          ...updated,
          cards: remainingCards,
          selectedCards: [],
        };
      }
      return updated;
    }),
  };

  if (remainingCards.length === 0) {
    const meldedFeederId =
      game.lastPlayedCards.length === 0 ? game.lastDiscardBy : null;
    return finishWithU(
      { ...table, game: nextGame },
      player.id,
      "uTron",
      meldedFeederId,
    );
  }

  updateTurnTimes(nextGame);
  return {
    ...table,
    game: nextGame,
  };
};

export const canDeclareU = (game: Game, player: GamePlayer): boolean => {
  if (
    game.state !== "playing" ||
    game.currentPlayerId !== player.id ||
    (game.phomPhase !== "meld" && game.phomPhase !== "discard")
  ) {
    return false;
  }
  return (
    findUPartition(
      player.cards,
      player.eatenCards ?? [],
      player.melds?.length ?? 0,
    ) !== null
  );
};

export const handleDeclareU = (table: Table, player: GamePlayer): Table => {
  const game = table.game;
  const partition = findUPartition(
    player.cards,
    player.eatenCards ?? [],
    player.melds?.length ?? 0,
  );
  if (!partition) return table;

  const maxMeldOrder = Math.max(
    0,
    ...game.players.map((p) => p.meldOrder ?? 0),
  );
  const winType: PhomWinType = partition.discard ? "u" : "uTron";
  const meldedFeederId =
    game.lastPlayedCards.length === 0 ? game.lastDiscardBy : null;

  const nextGame: Game = {
    ...game,
    playHistory: [
      ...game.playHistory,
      ...partition.melds.map((meld) => ({
        playerId: player.id,
        cards: meld,
        round: game.round,
      })),
    ],
    players: game.players.map((gp) => {
      if (gp.id !== player.id) return gp;
      return {
        ...gp,
        cards: [],
        eatenCards: [],
        melds: [...(gp.melds ?? []), ...partition.melds],
        discards: partition.discard
          ? [...(gp.discards ?? []), partition.discard]
          : (gp.discards ?? []),
        hasMelded: true,
        meldOrder: gp.meldOrder || maxMeldOrder + 1,
        selectedCards: [],
      };
    }),
  };

  return finishWithU(
    { ...table, game: nextGame },
    player.id,
    winType,
    meldedFeederId,
  );
};

export const canDiscard = (
  game: Game,
  player: GamePlayer,
  selectedCards: Card[],
): boolean => {
  if (
    game.state !== "playing" ||
    game.currentPlayerId !== player.id ||
    (game.phomPhase !== "meld" && game.phomPhase !== "discard")
  ) {
    return false;
  }
  if (selectedCards.length !== 1) return false;
  const c = selectedCards[0];
  if (!player.cards.some((hc) => areCardsEqual(hc, c))) return false;
  if ((player.eatenCards ?? []).some((ec) => areCardsEqual(ec, c))) {
    return false;
  }

  if (isMeldRound(player)) {
    return (player.eatenCards?.length ?? 0) === 0;
  }

  const remainingCards = player.cards.filter((hc) => !areCardsEqual(hc, c));
  return canCoverEatenCards(remainingCards, player.eatenCards ?? []);
};

const settlePointsEnd = (table: Table): Table => {
  const game = table.game;
  const multiplier = table.multiplier ?? 10;
  const readyPlayers = rotateReadyPlayers(
    game.players.filter((p) => p.isReady),
    game.startPlayerId!,
  ).map((p) => {
    const isMom = (p.melds?.length ?? 0) === 0;
    const score = p.cards.reduce((sum, c) => sum + getPhomCardPoint(c), 0);
    return {
      ...p,
      isMom,
      score,
    };
  });

  const ranked = [...readyPlayers].sort((a, b) => {
    if (a.isMom !== b.isMom) {
      return a.isMom ? 1 : -1;
    }
    if ((a.score ?? 0) !== (b.score ?? 0)) {
      return (a.score ?? 0) - (b.score ?? 0);
    }
    const orderA = a.meldOrder || 999;
    const orderB = b.meldOrder || 999;
    return orderA - orderB;
  });

  const winner = ranked[0];
  const chipChanges: Record<string, number> = {};
  for (const p of readyPlayers) {
    chipChanges[p.id] = 0;
  }

  for (let i = 1; i < ranked.length; i++) {
    const loser = ranked[i];
    const amount = (loser.isMom ? 4 : i) * multiplier;
    chipChanges[winner.id] += amount;
    chipChanges[loser.id] -= amount;
  }

  const scoredById: Record<string, GamePlayer> = {};
  for (const p of readyPlayers) {
    scoredById[p.id] = p;
  }

  const updatedPlayers = game.players.map((gp) => {
    const sp = scoredById[gp.id] ?? gp;
    return {
      ...sp,
      chipCount: sp.chipCount + (chipChanges[sp.id] ?? 0),
      paidVillage: false,
      cards: sp.cards.map((c) => ({ ...c, folded: false })),
    };
  });

  const endedGame: Game = {
    ...game,
    state: "ended",
    winnerId: winner.id,
    currentPlayerId: winner.id,
    phomWinType: "points",
    players: updatedPlayers,
  };

  return {
    ...table,
    game: endedGame,
    players: syncChipCounts(endedGame.players, table.players),
  };
};

export const handleDiscard = (
  table: Table,
  player: GamePlayer,
  selectedCards: Card[],
): Table => {
  const game = table.game;
  if (!canDiscard(game, player, selectedCards)) return table;

  const discardedCard = stripCardMeta(selectedCards[0]);
  const wasMeldRound = isMeldRound(player);
  const newDiscardCount = (player.discards?.length ?? 0) + 1;
  const isChot =
    (newDiscardCount === 3 && !player.hasMelded) || wasMeldRound;
  const maxMeldOrder = Math.max(
    0,
    ...game.players.map((p) => p.meldOrder ?? 0),
  );

  const remainingCards = player.cards.filter(
    (c) => !areCardsEqual(c, discardedCard),
  );
  const meldedFeederId =
    game.lastPlayedCards.length === 0 ? game.lastDiscardBy : null;

  let updatedCurrentPlayer: GamePlayer = player;
  const updatedPlayers = game.players.map((gp) => {
    if (gp.id !== player.id) return gp;
    updatedCurrentPlayer = {
      ...gp,
      cards: remainingCards,
      discards: [...(gp.discards ?? []), discardedCard],
      hasMelded: wasMeldRound ? true : gp.hasMelded,
      meldOrder: wasMeldRound
        ? gp.meldOrder || maxMeldOrder + 1
        : gp.meldOrder,
      lastAction: "play",
      lastPlayedRound: game.round,
      selectedCards: [],
    };
    return updatedCurrentPlayer;
  });

  const nextGame: Game = {
    ...game,
    lastPlayedCards: [discardedCard],
    lastDiscardBy: player.id,
    lastDiscardIsChot: isChot,
    playHistory: [
      ...game.playHistory,
      {
        playerId: player.id,
        cards: [discardedCard],
        round: game.round,
      },
    ],
    players: updatedPlayers,
  };

  if (
    remainingCards.length === 0 &&
    (updatedCurrentPlayer.melds?.length ?? 0) > 0
  ) {
    return finishWithU(
      { ...table, game: nextGame },
      player.id,
      "u",
      meldedFeederId,
    );
  }

  const readyOrdered = rotateReadyPlayers(
    nextGame.players.filter((p) => p.isReady),
    player.id,
  );
  const nextPlayer = readyOrdered[1] ?? readyOrdered[0];

  const allReachedFourDiscards = readyOrdered.every(
    (p) => (p.discards?.length ?? 0) >= 4,
  );

  if (allReachedFourDiscards) {
    const nextCanEat = canEatCard(
      nextPlayer.cards,
      nextPlayer.eatenCards ?? [],
      discardedCard,
    );
    const nextCanContinueOrU =
      nextCanEat &&
      ((nextGame.deck?.length ?? 0) > 0 ||
        findUPartition(
          [...nextPlayer.cards, discardedCard],
          [...(nextPlayer.eatenCards ?? []), discardedCard],
          nextPlayer.melds?.length ?? 0,
        ) !== null);

    if (!nextCanContinueOrU) {
      return settlePointsEnd({ ...table, game: nextGame });
    }
  }

  const nextRound = Math.min(
    4,
    Math.max(1, (nextPlayer.discards?.length ?? 0) + 1),
  );
  nextGame.currentPlayerId = nextPlayer.id;
  nextGame.phomPhase = "take";
  nextGame.round = nextRound;
  updateTurnTimes(nextGame);

  return {
    ...table,
    game: nextGame,
  };
};

export const getPhomPossibleActions = (
  table: Table,
  player: GamePlayer,
): PlayerAction[] => {
  const game = table.game;
  if (game.state !== "playing" || game.currentPlayerId !== player.id) {
    return [];
  }
  if (game.phomPhase === "take") {
    const actions: PlayerAction[] = [];
    if (canDraw(game, player)) actions.push("draw");
    if (canEat(game, player)) actions.push("eat");
    return actions;
  }
  if (game.phomPhase === "meld" || game.phomPhase === "discard") {
    const actions: PlayerAction[] = ["play"];
    if (isMeldRound(player)) {
      actions.push("meld");
      if ((player.melds?.length ?? 0) > 0) {
        actions.push("send");
      }
    }
    if (canDeclareU(game, player)) {
      actions.push("u");
    }
    return actions;
  }
  return [];
};

export const handlePhomAutoAction = (
  table: Table,
  player: GamePlayer,
): Table => {
  let currentTable = table;
  let currentPlayer =
    currentTable.game.players.find((p) => p.id === player.id) ?? player;

  if (currentTable.game.phomPhase === "take") {
    if (canDraw(currentTable.game, currentPlayer)) {
      return handleDraw(currentTable, currentPlayer);
    } else if (canEat(currentTable.game, currentPlayer)) {
      return handleEat(currentTable, currentPlayer);
    }
    return currentTable;
  }

  if (isMeldRound(currentPlayer)) {
    while ((currentPlayer.eatenCards?.length ?? 0) > 0) {
      const eatenList = currentPlayer.eatenCards ?? [];
      const { eatenMask } = computeEatenMask(currentPlayer.cards, eatenList);
      const subsets = getValidPhomSubsets(currentPlayer.cards, eatenMask);
      const validMeld = subsets.find(
        (s) =>
          (s.mask & eatenMask) !== 0 &&
          canMeld(currentTable.game, currentPlayer, s.cards),
      );
      if (!validMeld) break;
      currentTable = handleMeld(currentTable, currentPlayer, validMeld.cards);
      if (currentTable.game.state === "ended") return currentTable;
      currentPlayer =
        currentTable.game.players.find((p) => p.id === player.id) ??
        currentPlayer;
    }
  }

  const sortedDesc = getSortedPhomCards(currentPlayer.cards, true);
  const discardCandidate =
    sortedDesc.find((c) =>
      canDiscard(currentTable.game, currentPlayer, [c]),
    ) ?? sortedDesc[0];

  if (!discardCandidate) return currentTable;
  return handleDiscard(currentTable, currentPlayer, [discardCandidate]);
};

export const getPhomAutoAction = handlePhomAutoAction;

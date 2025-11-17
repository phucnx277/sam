const AbsoluteCardRanks: Partial<Record<Rank, number>> = {
  1: 14,
  2: 15,
};

export const canBeat = (
  playerSelectedCards: Card[],
  playerRemainingCards: Card[],
  opponentCards: Card[],
): boolean => {
  const validPlay = isValidPlay(playerSelectedCards, playerRemainingCards);
  if (!validPlay) return false;

  if (opponentCards.length === 0) return true;

  if (isOneRank(opponentCards)) {
    return isHigherRank(playerSelectedCards, opponentCards);
  }

  if (isStraight(opponentCards)) {
    return isHigherStraight(playerSelectedCards, opponentCards);
  }

  return false;
};

export const isValidPlay = (
  selectedCards: Card[],
  remainingCards: Card[],
): boolean => {
  if (!selectedCards) return false;
  if (selectedCards.length === 0) return false;

  // cannot leave "2" as final card
  const cardsAfterPlay = remainingCards.filter(
    (card) => !selectedCards.some((item) => areCardsIdentical(card, item)),
  );
  if (
    cardsAfterPlay.length &&
    isOneRank(cardsAfterPlay) &&
    cardsAfterPlay[0].rank === 2
  ) {
    return false;
  }

  if (selectedCards.length === 1) return true;
  if (isStraight(selectedCards)) return true;
  if (isOneRank(selectedCards)) return true;
  return false;
};

const isOneRank = (cards: Card[]): boolean => {
  const firstRank = cards[0].rank;
  return cards.every((card) => card.rank === firstRank);
};

export const isFourOfAKind = (cards: Card[]): boolean => {
  return cards.length === 4 && isOneRank(cards);
};

const isHigherRank = (playerCards: Card[], opponentCards: Card[]): boolean => {
  if (opponentCards.length === 1 && opponentCards[0].rank === 2) {
    return isFourOfAKind(playerCards);
  }
  const playerAbsoluteRank =
    AbsoluteCardRanks[playerCards[0].rank] || playerCards[0].rank;

  const opponentAbsoluteRank =
    AbsoluteCardRanks[opponentCards[0].rank] || opponentCards[0].rank;

  return playerAbsoluteRank > opponentAbsoluteRank;
};

export const isStraight = (cards: Card[]): boolean => {
  if (cards.length < 3) return false;
  const sortedRanks = getSortedRanks(cards);
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) {
      return false;
    }
  }
  return true;
};

const getSortedRanks = (cards: Card[]): number[] => {
  const sortedRanks = cards
    .map((card) => card.rank as number)
    .sort((a, b) => a - b);
  if (sortedRanks[0] === 1 && sortedRanks[sortedRanks.length - 1] === 13) {
    sortedRanks[0] = 14;
    sortedRanks.sort((a, b) => a - b);
  }
  return sortedRanks;
};

const isHigherStraight = (
  playerCards: Card[],
  opponentCards: Card[],
): boolean => {
  if (playerCards.length !== opponentCards.length) return false;
  const playerSortedRanks = getSortedRanks(playerCards);
  const opponentSortedRanks = getSortedRanks(opponentCards);
  return (
    playerSortedRanks[playerSortedRanks.length - 1] >
    opponentSortedRanks[opponentSortedRanks.length - 1]
  );
};

export const areCardsIdentical = (card: Card, anotherCard: Card): boolean => {
  return card.rank === anotherCard.rank && card.suit === anotherCard.suit;
};

export const getSortedCards = (cards: Card[], descending: boolean): Card[] => {
  return [...cards].sort(
    (a, b) =>
      (descending ? -1 : 1) *
      ((AbsoluteCardRanks[a.rank] ?? a.rank) -
        (AbsoluteCardRanks[b.rank] ?? b.rank)),
  );
};

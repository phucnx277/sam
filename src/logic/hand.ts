import { isStraight } from "./card";
import { CardsPerPlayer, SuitColorMap } from "./deck";

const WhiteWinnerRanks = {
  Poor: 1,
  SameColor: 2,
  FivePairs: 3,
  ThreeSets: 4,
  FourPigs: 5,
  Straight: 6,
};

export const checkWhiteTiger = (cards: Card[]): number => {
  if (cards.length !== CardsPerPlayer) return -1;
  if (isStraight(cards)) return WhiteWinnerRanks.Straight;
  if (isFourPigs(cards)) return WhiteWinnerRanks.FourPigs;
  if (isThreeSets(cards)) return WhiteWinnerRanks.ThreeSets;
  if (isFivePairs(cards)) return WhiteWinnerRanks.FivePairs;
  if (isSameColor(cards)) return WhiteWinnerRanks.SameColor;
  if (isPoor(cards)) return WhiteWinnerRanks.Poor;
  return -1;
};

const isFourPigs = (hand: Card[]): boolean => {
  let numCount = 0;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank === 2) {
      numCount++;
    }
  }
  return numCount === 4;
};

const isThreeSets = (hand: Card[]): boolean => {
  const rankCount: Partial<Record<Rank, number>> = {};
  let numSets = 0;
  for (let i = 0; i < hand.length; i++) {
    const rank = hand[i].rank;
    rankCount[rank] = (rankCount[rank] || 0) + 1;
    if (rankCount[rank] === 3) {
      numSets++;
    }
  }
  return numSets === 3;
};

const isFivePairs = (hand: Card[]): boolean => {
  const rankCount: Partial<Record<Rank, number>> = {};
  let numPairs = 0;
  for (let i = 0; i < hand.length; i++) {
    const rank = hand[i].rank;
    rankCount[rank] = (rankCount[rank] || 0) + 1;
    if (rankCount[rank] === 2 || rankCount[rank] === 4) {
      numPairs++;
    }
  }
  return numPairs === 5;
};

const isSameColor = (hand: Card[]): boolean => {
  const colorSet = new Set(hand.map((card) => SuitColorMap[card.suit]));
  return colorSet.size === 1;
};

const isPoor = (hand: Card[]): boolean => {
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].rank <= 2 || hand[i].rank >= 10) {
      return false;
    }
  }
  return true;
};

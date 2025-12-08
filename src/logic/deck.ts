const Suits: Suit[] = ["S", "C", "H", "D"];
const Ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const SuitColorMap: Record<Suit, SuitColor> = {
  H: "red",
  D: "red",
  C: "black",
  S: "black",
};
export const CardsPerPlayer: number = 10;

export const createDeck = (): Card[] => {
  const cards: Card[] = [];
  for (const suit of Suits) {
    for (const rank of Ranks) {
      cards.push({
        rank,
        suit,
      });
    }
  }
  return cards;
};

export const shuffleDeck = (deck: Card[], times = 1): Card[] => {
  times = Math.max(times, 1);
  let time = 0;
  while (time < times) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    time++;
  }
  return deck;
};

export const dealCards = (deck: Card[], numPlayers: number): Card[][] => {
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  for (let i = 0; i < CardsPerPlayer; i++) {
    for (let j = 0; j < numPlayers; j++) {
      const card = deck.shift();
      if (card) {
        hands[j].push(card);
      }
    }
  }
  return hands;
};

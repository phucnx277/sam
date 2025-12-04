type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
type Suit = "H" | "D" | "C" | "S"; // Hearts, Diamonds, Clubs, Spades
type SuitColor = "black" | "red";
type Card = {
  rank: Rank;
  suit: Suit;
  folded?: boolean;
  selected?: boolean;
};

type Player = {
  id: string;
  name: string;
  isAdmin?: boolean;
};

type LocalGame = {
  playerId: string;
  gameId: string;
  cards: Card[];
};

type GamePlayer = Player & {
  isReady: boolean;
  cards: Card[];
  selectedCards: Card[];
  chipCount: number;
  lastPlayedRound: number;
  lastAction: PlayerAction | null;
  starOfHope: boolean;
  paidVillage: boolean;
};

type TablePlayer = Player & { chipCount: number; isRemoved?: boolean };

type PlayerAction =
  | "startGame"
  | "newGame"
  | "ready"
  | "star"
  | "ask"
  | "tiger"
  | "play"
  | "pass"
  | "removePlayers"
  | "transferHost"
  | "resetSession";

type GameState = "waiting" | "handChecking" | "playing" | "ended";

type PlayHistory = {
  playerId: string;
  cards: Card[];
  round: number;
};

type Game = {
  id: string;
  state: GameState;
  startedAt: number;
  players: GamePlayer[];
  round: number;
  turnStartTs: number;
  turnEndTs: number;
  currentPlayerId: string | null;
  startPlayerId: string | null;
  lastPlayedCards: Card[];
  playHistory: PlayHistory[];
  winnerId: string | null;
  turnTimeout: number;
};

type Table = {
  id: string;
  hostId: string;
  name: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastGame: Game | null;
  game: Game;
  bo: number;
  playerLimit: number;
  turnTimeout: number;
  players: TablePlayer[];
};

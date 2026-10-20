type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
type Suit = "H" | "D" | "C" | "S"; // Hearts, Diamonds, Clubs, Spades
type SuitColor = "black" | "red";
type GameType = "sam" | "phom" | "poker";
type PhomPhase = "take" | "meld" | "discard";
type PhomWinType = "points" | "u" | "uTron" | "uKhan" | "uDen" | null;
type PokerMode = "cash" | "tournament";
type PokerStreet = "preflop" | "flop" | "turn" | "river" | "showdown";
type PokerHandCategory =
  | "highCard"
  | "onePair"
  | "twoPair"
  | "threeOfAKind"
  | "straight"
  | "flush"
  | "fullHouse"
  | "fourOfAKind"
  | "straightFlush"
  | "royalFlush";
type PokerWinType = "fold" | "showdown" | null;
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
  eatenCards?: Card[];
  discards?: Card[];
  melds?: Card[][];
  hasMelded?: boolean;
  meldOrder?: number;
  eatenCount?: number;
  isMom?: boolean;
  score?: number;
  stack?: number;
  buyIn?: number;
  streetBet?: number;
  totalBet?: number;
  foldedHand?: boolean;
  allIn?: boolean;
  actedOnStreet?: boolean;
  pokerHandRank?: PokerHandCategory;
  bestHandCards?: Card[];
  handWonChips?: number;
};

type TablePlayer = Player & {
  chipCount: number;
  isRemoved?: boolean;
  stack?: number;
  buyIn?: number;
};

type PlayerAction =
  | "startGame"
  | "newGame"
  | "ready"
  | "star"
  | "ask"
  | "tiger"
  | "play"
  | "pass"
  | "draw"
  | "eat"
  | "meld"
  | "send"
  | "u"
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "updatePokerConfig"
  | "addPokerChips"
  | "removePlayers"
  | "transferHost"
  | "resetSession";

type GameState = "waiting" | "handChecking" | "playing" | "ended";

type PlayHistory = {
  playerId: string;
  cards: Card[];
  round: number;
};

type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  ts: number;
  text?: string;
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
  chat: ChatMessage[];
  winnerId: string | null;
  turnTimeout: number;
  deck?: Card[];
  phomPhase?: PhomPhase;
  lastDiscardBy?: string | null;
  lastDiscardIsChot?: boolean;
  phomWinType?: PhomWinType;
  pokerStreet?: PokerStreet;
  communityCards?: Card[];
  pot?: number;
  currentBet?: number;
  minRaise?: number;
  dealerId?: string | null;
  smallBlindId?: string | null;
  bigBlindId?: string | null;
  pokerWinType?: PokerWinType;
  winnerIds?: string[];
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
  gameType?: GameType;
  multiplier?: number;
  pokerMode?: PokerMode;
  buyIn?: number;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
};

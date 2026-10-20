import type { TranslationKey } from "../logic/i18n";

export const en = {
  "common.language": "Language",
  "common.next": "Next",
  "common.cancel": "Cancel",
  "common.submit": "Submit",
  "common.close": "Close",
  "common.update": "Update",
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "common.installApp": "Install App",
  "common.appInstalled": "App installed",

  "settings.title": "Settings",
  "settings.currency": "Currency symbol",

  "credentials.apiKeyLabel": "Ably API key",
  "credentials.paste": "Paste",
  "credentials.apiKeyPlaceholder": "Paste your API key",
  "credentials.getKey": "Get a free API key at ",
  "credentials.checking": "Checking",
  "credentials.playWithoutAbly": "Play without API key",

  "player.enterName": "Enter your name",
  "player.namePlaceholder": "Input your name",
  "player.nameInvalid": "Name is invalid",
  "player.welcome": "Welcome,",
  "player.logout": "Log out",
  "player.infoCopied": "Player info copied",

  "lobby.noTable": "No table created",
  "lobby.selectGame": "Select a game",
  "lobby.selectTable": "Join a table",
  "lobby.pasteLink": "Or paste table's link here",
  "lobby.scan": "Scan QR",
  "lobby.chooseImage": "Choose image",
  "lobby.scanError":
    "Could not open the camera. Choose an image with a QR code instead.",
  "lobby.createTable": "Create table",
  "lobby.connectWithAbly": "Switch to compatible connection",
  "lobby.switchToPeer": "Play without API key",
  "lobby.connecting": "Connecting…",

  "connection.fastBenefit":
    "Players connect directly (WebRTC) for the lowest lag. It might not work on restrictive networks.",
  "connection.compatibleBenefit":
    "Players need a free Ably API key, higher latency but it works even on restrictive networks.",

  "table.newTitle": "New Table",
  "table.gameType": "Game",
  "table.gameSam": "Sâm",
  "table.gamePhom": "Phỏm",
  "table.gamePoker": "Poker",
  "table.pokerCash": "Cash Game",
  "table.pokerTournament": "Tournament",
  "table.namePlaceholder": "Name(*)",
  "table.passwordPlaceholder": "Password",
  "table.boPlaceholder": "Best Of X. Default = No Limit",
  "table.multiplierPlaceholder": "Multiplier. Default = 10",
  "table.buyInPlaceholder": "Buy-in / Starting stack. Default = 1000",
  "table.smallBlindPlaceholder": "Small Blind (SB). Default = 5",
  "table.bigBlindPlaceholder": "Big Blind (BB). Default = 10",
  "table.antePlaceholder": "Ante. Default = 0",
  "table.playerLimitPlaceholder": "Player limit. Default = 5",
  "table.phomPlayerLimitPlaceholder": "Player limit (2-4). Default = 4",
  "table.pokerPlayerLimitPlaceholder": "Player limit (2-9). Default = 6",
  "table.turnTimeoutPlaceholder":
    "Turn timeout (seconds). Default = 0 = Disabled",
  "table.tableLabel": "Table: ",
  "table.idLabel": "Table ID: ",
  "table.enterPassword": "Enter password",
  "table.enter": "Enter",
  "table.nameLabel": "Table name: ",
  "table.hostLabel": "Host:",
  "table.activePlayers": "Active:",
  "table.removedPlayers": "Removed:",
  "table.apiKeyLabel": "Ably API key:",
  "table.pokerMode": "Mode:",
  "table.blindsLabel": "Blinds (SB/BB):",
  "table.anteLabel": "Ante:",
  "table.buyInLabel": "Buy-in:",
  "table.addChipsTitle": "Add chips (Cash Game):",
  "table.addChipsAmountPlaceholder": "Chips to add",
  "table.addChipsBtn": "+ Chips",
  "table.updateBlindsBtn": "Update Blinds",
  "table.share": "Share",
  "table.copyLink": "Copy link",
  "table.linkCopied": "Link copied!",
  "table.downloadQr": "Download QR",
  "table.scanNote": "Ask your friend to scan this to join the table.",
  "table.summary": "Summary",
  "table.linkInvalid": "Link is invalid",

  "game.prevTurn": "Previous",
  "game.currentTurn": "Current",
  "game.bo": "BO:",
  "game.multiplier": "Multiplier:",
  "game.noc": "Deck:",
  "game.melds": "Melds",
  "game.discards": "Discards",
  "game.eaten": "Eaten",
  "game.points": "{points} pts",
  "game.mom": "Burned (Móm)",
  "game.u": "Ù!",
  "game.uTron": "Ù tròn!",
  "game.uKhan": "Ù khan!",
  "game.uDen": "Ù đền!",
  "game.chot": "Last",
  "game.pot": "Pot:",
  "game.blinds": "Blinds:",
  "game.ante": "Ante:",
  "game.stack": "Stack:",
  "game.bet": "Bet:",
  "game.street.preflop": "Pre-Flop",
  "game.street.flop": "Flop",
  "game.street.turn": "Turn",
  "game.street.river": "River",
  "game.street.showdown": "Showdown",
  "game.dealer": "D",
  "game.sb": "SB",
  "game.bb": "BB",
  "game.folded": "Folded",
  "game.allIn": "All-In",
  "game.wonChips": "+{chips}",
  "game.min": "Min",
  "game.halfPot": "1/2 Pot",
  "game.fullPot": "Pot",
  "game.yourTurn": "Your turn!",
  "game.turnPassed": "Turn passed",
  "game.cardsLocked": "Cards locked",
  "game.cardsUnlocked": "Cards unlocked",
  "game.directMode": "Direct connection (WebRTC)",
  "game.fallbackMode": "Compatible connection (Ably)",
  "game.menu": "Options",
  "game.tableInfo": "Table info",

  "chat.title": "Chat",
  "chat.open": "Chat",
  "chat.placeholder": "Type a message",
  "chat.send": "Send",
  "chat.empty": "No messages yet",

  "action.ready": "Ready",
  "action.starOfHope": "⭐ Star of hope",
  "action.newGame": "New game",
  "action.deal": "Deal",
  "action.ask": "Ask",
  "action.tiger": "Tiger",
  "action.play": "Play",
  "action.pass": "Pass",
  "action.draw": "Draw",
  "action.eat": "Eat",
  "action.meld": "Meld",
  "action.send": "Send",
  "action.u": "Ù",
  "action.fold": "Fold",
  "action.check": "Check",
  "action.call": "Call",
  "action.bet": "Bet",
  "action.raise": "Raise",
  "action.allIn": "All-In",
  "action.updatePokerConfig": "Update Blinds",
  "action.addPokerChips": "Add chips",
  "action.resetSession": "Reset session",
  "action.removePlayers": "Remove players",
  "action.transferHost": "Transfer host",

  "hand.straight": "Dragon straight",
  "hand.fourPigs": "Four twos",
  "hand.threeSets": "Three sets",
  "hand.fivePairs": "Five pairs",
  "hand.sameColor": "Same color",
  "hand.poor": "Poor",

  "poker.hand.highCard": "High Card",
  "poker.hand.onePair": "One Pair",
  "poker.hand.twoPair": "Two Pair",
  "poker.hand.threeOfAKind": "Three of a Kind",
  "poker.hand.straight": "Straight",
  "poker.hand.flush": "Flush",
  "poker.hand.fullHouse": "Full House",
  "poker.hand.fourOfAKind": "Four of a Kind",
  "poker.hand.straightFlush": "Straight Flush",
  "poker.hand.royalFlush": "Royal Flush",

  "confirm.logout": "Are you sure?",
  "confirm.deleteTable": "Delete?",
  "confirm.leaveTable": "Leave the table?",
  "confirm.tiger": "Declare tiger 🐆?",
  "confirm.resetSession": "Are you sure?",

  "error.tableLimit": "Max number of tables is {limit}",
  "error.tableFull": "Table can only have {limit} players",
  "error.passwordIncorrect": "Password is incorrect",
  "error.playersExceedLimit": "Number of players exceeds limit",
  "error.cannotRemoveAllPlayers": "Cannot remove all players",
  "error.cannotRemoveHost": "Cannot remove the host",
  "error.peerFull": "The table is full",
  "error.peerUnreachable": "Could not reach the table host",

  "howToPlay.title": "How to play",
  "howToPlay.rulesTab": "Rules",
  "howToPlay.gesturesTab": "Gestures",

  "howToPlay.rules.setup": "Setup",
  "howToPlay.rules.setup1": "2 to 5 players, each is dealt 10 cards.",
  "howToPlay.rules.setup2":
    "The first game of a session starts with the holder of 3♠; later games start with the previous winner.",

  "howToPlay.rules.plays": "Valid plays",
  "howToPlay.rules.plays1":
    "A single card, a set/pair (cards of the same rank) or a straight (3 or more consecutive ranks).",
  "howToPlay.rules.plays2": "Q-K-A and A-2-3 are valid straights.",
  "howToPlay.rules.plays3":
    "The 2 is the highest single and can only be beaten by a four of a kind.",
  "howToPlay.rules.plays4": "You may not leave a 2 as your final card.",

  "howToPlay.rules.turns": "Turn flow",
  "howToPlay.rules.turns1":
    "On your turn you must beat the previous play or pass.",
  "howToPlay.rules.turns2":
    "When everyone else has passed, the last player opens a new round.",
  "howToPlay.rules.turns3": "The first to empty their hand wins.",

  "howToPlay.rules.calls": "Tiger (Báo)",
  "howToPlay.rules.calls1":
    "Before playing you may declare Tiger if you believe you hold a special hand.",
  "howToPlay.rules.calls2":
    "Special hand order: Dragon straight > Four twos > Three sets > Five pairs > Same color > Poor.",
  "howToPlay.rules.calls3":
    "A correct Tiger (white tiger) wins immediately and everyone else pays you chips.",
  "howToPlay.rules.calls4":
    "After declaring you must play first. If someone kills you (plays a card), you pay the killer.",

  "howToPlay.rules.chips": "Chips",
  "howToPlay.rules.chips1":
    "The winner gets 1 chip per remaining card of each loser; a loser still holding all 10 cards (burned) pays 15 chips.",
  "howToPlay.rules.chips2":
    "A correct Tiger gets 20 chips from each other player; if killed, the Tiger pays 20 chips per other player to the killer.",
  "howToPlay.rules.chips3":
    "A four of a kind beats a 2 and settles a 20-chip difference with the player it beats.",
  "howToPlay.rules.chips4":
    "BO mode: each win is 1 chip; first to half the BO (rounded up) wins the match.",

  "howToPlay.rules.village": "Paying the village (đền làng)",
  "howToPlay.rules.village1":
    "If you are last in a round and could have beaten the final single card but passed, you pay the village: you cover every loser instead of them.",

  "howToPlay.rules.star": "⭐ Star of hope",
  "howToPlay.rules.star1": "Only available when BO is unlimited.",
  "howToPlay.rules.star2":
    "When both sides use ⭐, all chip values are doubled (2 instead of 1, 20 instead of 15, 30 instead of 20).",

  "howToPlay.phom.setup": "Setup (Phỏm)",
  "howToPlay.phom.setup1":
    "2 to 4 players. The starter is dealt 10 cards, others receive 9 cards, and the rest form the draw pile (Nọc).",
  "howToPlay.phom.setup2":
    "Card points: A=1, 2..10 face value, J=11, Q=12, K=13. A dealt hand with no partial meld (cạ) wins Ù khan immediately.",
  "howToPlay.phom.melds": "Melds (Phỏm) & Pairs (Cạ)",
  "howToPlay.phom.melds1":
    "Set (Phỏm ngang): 3 or 4 cards of the same rank. Run (Phỏm dọc): 3+ consecutive cards of the same suit (A low, K high).",
  "howToPlay.phom.turns": "Turn flow",
  "howToPlay.phom.turns1":
    "On your turn, Eat the previous player's discard (if it forms a meld) or Draw 1 card from the deck, then Discard 1 card.",
  "howToPlay.phom.turns2":
    "When a discard is eaten, discards shift to keep round counts aligned (enabling né hạ and extra rounds).",
  "howToPlay.phom.turns3":
    "In the final round (with 3 discards), before your 4th discard you must Meld your Phỏms and may Send cards to existing melds.",
  "howToPlay.phom.chips": "Scoring & Chips (multiplied by Multiplier)",
  "howToPlay.phom.chips1":
    "After 4 rounds without Ù: lowest remaining points wins 1st (ties broken by who melded first). 2nd pays 1, 3rd pays 2, 4th pays 3, Burned (no meld) pays 4 to 1st.",
  "howToPlay.phom.chips2":
    "Ù (0 points / 3 melds / ù gửi / ù tròn / ù khan): each loser pays 5 to the winner.",
  "howToPlay.phom.chips3":
    "1st eaten card pays 1, 2nd pays 2, eating the last-round card (chốt) pays 4 from the discarder. Feeding 3 eaten cards pays 15 (Đền) to the Ù winner.",

  "howToPlay.poker.setup": "Setup (No-Limit Texas Hold'em)",
  "howToPlay.poker.setup1":
    "2 to 9 players. Each player is dealt 2 private Hole Cards and shares up to 5 Community Cards on the board.",
  "howToPlay.poker.setup2":
    "Cash Game mode: the host can add chips to players and adjust Small/Big Blind and Ante before each new deal. Tournament mode: players start with the buy-in stack (eliminated at 0 chips) and the host can increase Blinds/Ante before each deal.",
  "howToPlay.poker.blinds": "Dealer, Blinds & Ante",
  "howToPlay.poker.blinds1":
    "The Dealer button (D) rotates clockwise each hand. The two players left of D post the Small Blind (SB) and Big Blind (BB) (in Heads-Up with 2 players: D posts SB and acts first Pre-Flop, last on later streets).",
  "howToPlay.poker.streets": "Betting streets",
  "howToPlay.poker.streets1":
    "4 betting streets: Pre-Flop (hole cards only) → Flop (first 3 community cards) → Turn (4th card) → River (5th card) → Showdown.",
  "howToPlay.poker.streets2":
    "On your turn, you may Fold, Check (when no bet is facing you), Call, Raise (at least the previous raise size or BB), or go All-In.",
  "howToPlay.poker.hands": "Hand rankings & Side Pots",
  "howToPlay.poker.hands1":
    "Best 5-card hand from 7 cards (highest to lowest): Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight (Ace can play low in A-2-3-4-5 or high in 10-J-Q-K-A) > Three of a Kind > Two Pair > One Pair > High Card.",
  "howToPlay.poker.hands2":
    "When a player goes All-In with a smaller stack, Main Pot and Side Pots are automatically split based on each player's contribution.",

  "howToPlay.gestures.flip": "Flipping cards",
  "howToPlay.gestures.flip1": "Tap a face-down card to flip it up.",
  "howToPlay.gestures.flip2":
    "Swipe left / right to flip all cards face-down / face-up.",
  "howToPlay.gestures.select": "Selecting cards",
  "howToPlay.gestures.select1": "Tap a face-up card to select or deselect it.",
  "howToPlay.gestures.sort": "Sorting cards",
  "howToPlay.gestures.sort1": "Swipe up / down to sort ascending / descending.",
  "howToPlay.gestures.sort2":
    "In mobile portrait the axes swap: swipe up/down to flip, left/right to sort.",
  "howToPlay.gestures.reorder": "Reordering cards",
  "howToPlay.gestures.reorder1":
    "Select exactly one card, then tap the green slot where it should go.",
  "howToPlay.gestures.reorder2": "Available while cards are unlocked.",
  "howToPlay.gestures.lock": "Locking cards",
  "howToPlay.gestures.lock1":
    "Press and hold your hand for 1 second, or tap the 🔒/🔓 icon below the 🔙 button, to lock or unlock sorting.",
  "howToPlay.gestures.buttons": "Buttons",
  "howToPlay.gestures.buttons1":
    "🔙 leave the table. The ☰ button opens a menu: ℹ️ table info, 🔗 share the table, 💬 chat, 🙋‍♂️ how to play, ⚙️ settings.",
} satisfies Record<TranslationKey, string>;

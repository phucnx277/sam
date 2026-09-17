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

  "credentials.apiKeyLabel": "Your Ably API Key",
  "credentials.paste": "Paste",
  "credentials.apiKeyPlaceholder": "Ably API key",
  "credentials.getKey": "Get a new key here: ",
  "credentials.checking": "Checking",

  "player.enterName": "Enter your name",
  "player.namePlaceholder": "Input your name",
  "player.nameInvalid": "Name is invalid",
  "player.welcome": "Welcome,",
  "player.logout": "Log out",
  "player.infoCopied": "Player info copied",

  "lobby.selectTable": "Select a table",
  "lobby.pasteLink": "Or paste your link here",
  "lobby.createTable": "Create table",

  "table.newTitle": "New Table",
  "table.namePlaceholder": "Name(*)",
  "table.passwordPlaceholder": "Password",
  "table.boPlaceholder": "Best Of X. Default = No Limit",
  "table.playerLimitPlaceholder": "Player limit. Default = 5",
  "table.turnTimeoutPlaceholder": "Turn timeout (seconds). Default = 0 = Disabled",
  "table.tableLabel": "Table: ",
  "table.enterPassword": "Enter password",
  "table.enter": "Enter",
  "table.nameLabel": "Table name: ",
  "table.hostLabel": "Host:",
  "table.activePlayers": "Active:",
  "table.removedPlayers": "Removed:",
  "table.apiKeyLabel": "API Key:",
  "table.copyLink": "Copy link",
  "table.linkCopied": "Link copied!",
  "table.summary": "Summary",
  "table.linkInvalid": "Link is invalid",

  "game.prevTurn": "Previous",
  "game.currentTurn": "Current",
  "game.bo": "BO:",
  "game.yourTurn": "Your turn!",
  "game.cardsSorted": "Cards sorted",

  "action.ready": "Ready",
  "action.starOfHope": "⭐ Star of hope",
  "action.newGame": "New game",
  "action.deal": "Deal",
  "action.ask": "Ask",
  "action.tiger": "Tiger",
  "action.play": "Play",
  "action.pass": "Pass",
  "action.resetSession": "Reset session",
  "action.removePlayers": "Remove players",
  "action.transferHost": "Transfer host",

  "hand.straight": "Dragon straight",
  "hand.fourPigs": "Four twos",
  "hand.threeSets": "Three sets",
  "hand.fivePairs": "Five pairs",
  "hand.sameColor": "Same color",
  "hand.poor": "Poor",

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

  "howToPlay.title": "How to play",
  "howToPlay.rulesTab": "Rules",
  "howToPlay.gesturesTab": "Gestures",

  "howToPlay.rules.setup": "Setup",
  "howToPlay.rules.setup1":
    "2 to 5 players, each is dealt 10 cards.",
  "howToPlay.rules.setup2":
    "The first game of a session starts with the holder of 3♠; later games start with the previous winner.",

  "howToPlay.rules.plays": "Valid plays",
  "howToPlay.rules.plays1":
    "A single card, a set/pair (cards of the same rank) or a straight (3 or more consecutive ranks).",
  "howToPlay.rules.plays2": "Q-K-A and A-2-3 are valid straights.",
  "howToPlay.rules.plays3":
    "The 2 is the highest single and can only be beaten by a four of a kind.",
  "howToPlay.rules.plays4":
    "You may not leave a 2 as your final card.",

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

  "howToPlay.gestures.flip": "Flipping cards",
  "howToPlay.gestures.flip1": "Tap a face-down card to flip it up.",
  "howToPlay.gestures.flip2":
    "Swipe left / right to flip all cards face-down / face-up.",
  "howToPlay.gestures.select": "Selecting cards",
  "howToPlay.gestures.select1":
    "Tap a face-up card to select or deselect it.",
  "howToPlay.gestures.sort": "Sorting cards",
  "howToPlay.gestures.sort1":
    "Swipe up / down to sort ascending / descending.",
  "howToPlay.gestures.sort2":
    "In mobile portrait the axes swap: swipe up/down to flip, left/right to sort.",
  "howToPlay.gestures.reorder": "Reordering cards",
  "howToPlay.gestures.reorder1":
    "Select exactly one card, then tap the green slot where it should go.",
  "howToPlay.gestures.reorder2":
    'Toggle reordering with the "Cards sorted" checkbox.',
  "howToPlay.gestures.buttons": "Buttons",
  "howToPlay.gestures.buttons1":
    "⬅️ leave the table, ℹ️ table info, 🙋‍♂️ how to play.",
} satisfies Record<TranslationKey, string>;

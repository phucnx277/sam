# Texas Hold'em No-Limit Poker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full support for No-Limit Texas Hold'em Poker (`gameType: "poker"`) with Cash Game and Tournament modes, 2–9 players, Dealer/SB/BB/Ante rotation, Pre-flop/Flop/Turn/River/Showdown betting streets, 7-card best-5 hand evaluation, side pots, and host controls for stacks and blinds.

**Architecture:** Extend `Table`, `Game`, `GamePlayer`, `TablePlayer`, and `PlayerAction` ambient types in `src/type.d.ts` and implement the pure Texas Hold'em engine in `src/logic/poker.ts`. Wire Poker table creation, player join/reset stack accounting, and action definitions into `src/logic/table.ts` and `src/logic/game.ts`, and update table and gameplay UI components to render Poker controls, community cards, pots, stacks, position badges, host blind/chip management, and rules.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, Zustand.

---

### Task 1: Add Poker Locales, Ambient Types, and Pure Poker Engine (`src/logic/poker.ts`)

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`
- Modify: `src/type.d.ts`
- Create: `src/logic/poker.ts`

- [ ] **Step 1: Add Poker translation keys to `src/locales/vi.ts` and `src/locales/en.ts`**

Add keys in `src/locales/vi.ts` (and matching English strings in `src/locales/en.ts`) for:
```ts
  "table.gamePoker": "Poker",
  "table.pokerCash": "Cash Game",
  "table.pokerTournament": "Tournament",
  "table.buyInPlaceholder": "Buy-in / Stack ban đầu. Mặc định = 1000",
  "table.smallBlindPlaceholder": "Small Blind (SB). Mặc định = 5",
  "table.bigBlindPlaceholder": "Big Blind (BB). Mặc định = 10",
  "table.antePlaceholder": "Ante. Mặc định = 0",
  "table.pokerPlayerLimitPlaceholder":
    "Giới hạn người chơi (2-9). Mặc định = 6",
  "table.pokerMode": "Chế độ:",
  "table.blindsLabel": "Blinds (SB/BB):",
  "table.anteLabel": "Ante:",
  "table.buyInLabel": "Buy-in:",
  "table.addChipsTitle": "Bơm chip (Cash Game):",
  "table.addChipsAmountPlaceholder": "Số chip thêm",
  "table.addChipsBtn": "+ Chip",
  "table.updateBlindsBtn": "Cập nhật Blinds",

  "game.pot": "Pot:",
  "game.blinds": "Blinds:",
  "game.ante": "Ante:",
  "game.stack": "Stack:",
  "game.bet": "Cược:",
  "game.street.preflop": "Pre-Flop",
  "game.street.flop": "Flop",
  "game.street.turn": "Turn",
  "game.street.river": "River",
  "game.street.showdown": "Showdown",
  "game.dealer": "D",
  "game.sb": "SB",
  "game.bb": "BB",
  "game.folded": "Bỏ bài",
  "game.allIn": "All-In",
  "game.wonChips": "+{chips}",
  "game.min": "Min",
  "game.halfPot": "1/2 Pot",
  "game.fullPot": "Pot",

  "action.fold": "Úp bỏ",
  "action.check": "Xem",
  "action.call": "Theo",
  "action.raise": "Tố",
  "action.allIn": "All-In",
  "action.updatePokerConfig": "Cập nhật Blinds",
  "action.addPokerChips": "Bơm chip",

  "poker.hand.highCard": "Mậu thầu",
  "poker.hand.onePair": "Một đôi",
  "poker.hand.twoPair": "Hai đôi",
  "poker.hand.threeOfAKind": "Sám cô",
  "poker.hand.straight": "Sảnh",
  "poker.hand.flush": "Thùng",
  "poker.hand.fullHouse": "Cù lũ",
  "poker.hand.fourOfAKind": "Tứ quý",
  "poker.hand.straightFlush": "Thùng phá sảnh",
  "poker.hand.royalFlush": "Sảnh chúa",

  "howToPlay.poker.setup": "Chuẩn bị (Texas Hold'em No-Limit)",
  "howToPlay.poker.setup1":
    "Bàn chơi từ 2 đến 9 người. Mỗi người được chia 2 lá bài tẩy (Hole Cards) và dùng chung tối đa 5 lá bài chung (Community Cards) trên bàn.",
  "howToPlay.poker.setup2":
    "Chế độ Cash Game: chủ bàn có thể bơm thêm chip cho người chơi và chỉnh Small/Big Blind, Ante trước mỗi ván mới. Chế độ Tournament: người chơi dùng stack khởi đầu (hết stack sẽ bị loại) và chủ bàn có thể tăng Blinds/Ante trước ván mới.",
  "howToPlay.poker.blinds": "Dealer, Blinds & Ante",
  "howToPlay.poker.blinds1":
    "Vị trí Dealer (D) xoay vòng theo chiều kim đồng hồ sau mỗi ván. Hai người bên trái D đặt Small Blind (SB) và Big Blind (BB) (khi chỉ có 2 người: D đặt SB và hành động trước ở Pre-Flop, sau ở các vòng sau).",
  "howToPlay.poker.streets": "Các vòng cược",
  "howToPlay.poker.streets1":
    "4 vòng cược: Pre-Flop (chưa mở bài chung) → Flop (mở 3 lá chung) → Turn (mở lá thứ 4) → River (mở lá thứ 5) → Showdown.",
  "howToPlay.poker.streets2":
    "Trong lượt, bạn có thể Úp bỏ (Fold), Xem (Check - khi chưa ai tố thêm), Theo (Call), Tố (Raise - tối thiểu bằng mức tố trước đó hoặc BB) hoặc Tất tay (All-In).",
  "howToPlay.poker.hands": "Thứ hạng tay bài & Chia Pot",
  "howToPlay.poker.hands1":
    "Thứ tự tay bài 5 lá mạnh nhất từ 7 lá (từ cao xuống thấp): Sảnh chúa (Royal Flush) > Thùng phá sảnh (Straight Flush) > Tứ quý (Four of a Kind) > Cù lũ (Full House) > Thùng (Flush) > Sảnh (Straight, A có thể tính là 1 trong A-2-3-4-5 hoặc cao nhất trong 10-J-Q-K-A) > Sám cô (Three of a Kind) > Hai đôi (Two Pair) > Một đôi (One Pair) > Mậu thầu (High Card).",
  "howToPlay.poker.hands2":
    "Khi có người All-In với số chip ít hơn, hệ thống tự động tách Main Pot và Side Pot theo mức đóng góp của từng người.",
```

- [ ] **Step 2: Update `src/type.d.ts` with Poker types**

Extend `GameType` to `"sam" | "phom" | "poker"`, add `PokerMode`, `PokerStreet`, `PokerHandCategory`, `PokerWinType`, and add optional Poker fields to `GamePlayer`, `TablePlayer`, `PlayerAction`, `Game`, and `Table`.

- [ ] **Step 3: Create `src/logic/poker.ts`**

Implement the pure Texas Hold'em No-Limit engine:
- `getPokerCardValue`, `getSortedPokerCards`
- `evaluatePokerHand`, `comparePokerScores`
- `settlePokerPots` (main pot + side pots + uncalled bet return + odd chip distribution clockwise from dealer)
- `startPokerGame` (rotates dealer among ready players with `stack > 0`, posts antes & blinds, deals 2 hole cards, handles immediate all-in runout if needed)
- `canFold`, `handleFold`
- `canCheck`, `handleCheck`
- `canCall`, `getCallAmount`, `handleCall`
- `getRaiseBounds`, `canRaise`, `handleRaise`
- `canAllIn`, `handleAllIn`
- `getPokerPossibleActions`, `handlePokerAutoAction`
- `handleUpdatePokerConfig`, `handleAddPokerChips`

- [ ] **Step 4: Run build and lint**

Run: `npm run build && npm run lint`
Expected: PASS with 0 errors.

---

### Task 2: Wire Poker into `src/logic/table.ts` and `src/logic/game.ts`

**Files:**
- Modify: `src/logic/table.ts`
- Modify: `src/logic/game.ts`

- [ ] **Step 1: Update `src/logic/table.ts` for Poker table configuration, join stacks, and session reset**

- Extend `NewTableParams` with `pokerMode?: PokerMode`, `buyIn?: number`, `smallBlind?: number`, `bigBlind?: number`, `ante?: number`.
- In `newTable`, initialize `pokerMode: params.pokerMode || "cash"`, `buyIn: params.buyIn || 1000`, `smallBlind: params.smallBlind || 5`, `bigBlind: params.bigBlind || 10`, `ante: params.ante ?? 0`. When `gameType === "poker"`, initialize the host player's `stack: buyIn`, `buyIn: buyIn`, `chipCount: 0` in both `game.players` and `table.players`.
- In `enterTable` and `addTablePlayer`, when `table.gameType === "poker"`, initialize new joining players with `stack: table.buyIn ?? 1000`, `buyIn: table.buyIn ?? 1000`, `chipCount: 0` (or restore from `tblPlayer` if rejoining).
- In `resetSession`, when `table.gameType === "poker"`, reset all players' `stack = table.buyIn ?? 1000`, `buyIn = table.buyIn ?? 1000`, `chipCount = 0`.

- [ ] **Step 2: Update `src/logic/game.ts` to delegate Poker lifecycle and actions**

- In `newGame` and `newGamePlayer`, preserve player `stack` and `buyIn`, reset per-hand Poker fields (`streetBet: 0`, `totalBet: 0`, `foldedHand: false`, `allIn: false`, `actedOnStreet: false`, `pokerHandRank: undefined`, `bestHandCards: undefined`, `handWonChips: undefined`), and initialize game Poker fields (`pokerStreet: undefined`, `communityCards: []`, `pot: 0`, `currentBet: 0`, `minRaise: 0`, `dealerId: lastGame?.dealerId ?? null`, `smallBlindId: null`, `bigBlindId: null`, `pokerWinType: null`, `winnerIds: []`).
- In `newGame`, if `lastGame?.winnerId` has `stack !== undefined && stack <= 0`, do not auto-mark them `isReady: true`.
- In `ActionDef.ready`: for Poker in Tournament mode (or Cash mode), disable toggling ready on if `(currentPlayer.stack ?? 0) <= 0`.
- In `ActionDef.star`: hide when `playingTable.gameType !== "sam"` (i.e. only show for Sâm when `bo < 0`).
- In `ActionDef.newGame`:
  - For Poker, allow the winner (or `hostId` if winner is not ready or has `stack <= 0`) to start a new game.
  - In Poker Tournament mode (`playingTable.gameType === "poker" && playingTable.pokerMode === "tournament"`), disable `newGame` when fewer than 2 players on the table have `(stack ?? 0) > 0` (tournament champion decided).
- In `ActionDef.startGame`:
  - For Poker, require at least 2 ready players with `(stack ?? 0) > 0`.
  - When `playingTable.gameType === "poker"`, call `startPokerGame(table)` and sync `table.players` stacks/chipCounts if the hand immediately ended (e.g. everyone all-in on blinds/antes).
- Add `ActionDef` entries for `"fold"`, `"check"`, `"call"`, `"raise"`, `"allIn"`, `"updatePokerConfig"`, `"addPokerChips"`.
- Update `getCurrentPossibleActions` to delegate to `getPokerPossibleActions` when `table.gameType === "poker"`.

- [ ] **Step 3: Run build and lint**

Run: `npm run build && npm run lint`
Expected: PASS with 0 errors.

---

### Task 3: Update Table Creation (`NewTable.tsx`), Lobby Badge (`LobbyTable.tsx`), and Host Controls (`TableInfo.tsx`)

**Files:**
- Modify: `src/components/Tables/NewTable.tsx`
- Modify: `src/components/Tables/LobbyTable.tsx`
- Modify: `src/components/Tables/TableInfo.tsx`

- [ ] **Step 1: Add Poker option and inputs in `NewTable.tsx`**

- Add `"poker"` button (`t("table.gamePoker")`) to the game type selector (`Sâm` | `Phỏm` | `Poker`).
- When `form.gameType === "poker"`:
  - Show a segmented toggle for `Cash Game` (`"cash"`) vs `Tournament` (`"tournament"`).
  - Show inputs for `buyIn` (default `1000`, min `1`), `smallBlind` (default `5`, min `1`), `bigBlind` (default `10`, min `smallBlind`), and `ante` (default `0`, min `0`).
  - Validate `playerLimit` in `2..9` (default `6`).

- [ ] **Step 2: Show `[Poker]` badge in `LobbyTable.tsx`**

- Prefix table name with `[Poker]` when `data.gameType === "poker"`.

- [ ] **Step 3: Add Poker info, Blind/Ante controls, and Cash Game chip top-up in `TableInfo.tsx`**

- Show game type `Poker (Cash Game)` or `Poker (Tournament)` and current `Blinds: {smallBlind}/{bigBlind}` + `Ante: {ante}`.
- In `TablePlayerInfo`, when `playingTable.gameType === "poker"`, show the player's current `stack` alongside their net `chipCount` (and in `copy("result")` summary, include both stack and net P&L).
- When `!isReadOnly && playingTable.gameType === "poker"`:
  - Render inputs to adjust `smallBlind`, `bigBlind`, and `ante` (in Tournament mode, enforce `>=` current values) with an update button that dispatches `ActionDef.updatePokerConfig`.
  - When `playingTable.pokerMode !== "tournament"`, render a quick "Add Chips" row where the host selects an active player and an amount (e.g., default `table.buyIn ?? 1000`) and clicks `+ Chip` to dispatch `ActionDef.addPokerChips`.

- [ ] **Step 4: Run build and lint**

Run: `npm run build && npm run lint`
Expected: PASS with 0 errors.

---

### Task 4: Update Gameplay UI (`PlayingTable.tsx`, `Actions.tsx`, `GamePlayer.tsx`, `PlayerInfo.tsx`, `HowToPlay.tsx`)

**Files:**
- Modify: `src/components/Tables/PlayingTable.tsx`
- Modify: `src/components/GamePlayer/Actions.tsx`
- Modify: `src/components/GamePlayer/GamePlayer.tsx`
- Modify: `src/components/GamePlayer/PlayerInfo.tsx`
- Modify: `src/components/GamePlayer/HowToPlay.tsx`

- [ ] **Step 1: Update `PlayingTable.tsx` for Poker info panel, Pot, Street badge, and Community Cards**

- In the left info column, when `playingTable.gameType === "poker"`, display `Cash` / `Tournament` mode, `SB/BB: {smallBlind}/{bigBlind}`, and `Ante: {ante}` (if `> 0`).
- In the center board area, when `playingTable.gameType === "poker"`:
  - Show a top badge strip with `Pot: {pot}` and the current street (`Pre-Flop`, `Flop`, `Turn`, `River`, `Showdown`).
  - Render `playingTable.game.communityCards` using `<Cards>` in the center of the board when `communityCards.length > 0`.

- [ ] **Step 2: Update `Actions.tsx` for Poker betting controls and timeout auto-action**

- In `handleAutoAction`, when `playingTable.gameType === "poker"`, call `onAction(handlePokerAutoAction(playingTable!, curPlayer!))`.
- When `playingTable.gameType === "poker"` and `isGameInProgress(playingTable.game)` and `playingTable.game.currentPlayerId === gamePlayer.id`:
  - Render Poker action controls:
    - Left side: `TwoStepButton` for `fold` and `check` / `call` (showing call amount `Call ({callAmt})`).
    - Right side: When `canRaise`, render a compact bet/raise amount selector (number input + range slider + preset buttons `Min`, `1/2 Pot`, `Pot`, `All-In`) paired with `TwoStepButton` for `raise` (`Raise ({raiseAmount})`), plus `TwoStepButton` for `allIn` when applicable.

- [ ] **Step 3: Update `PlayerInfo.tsx` and `GamePlayer.tsx` for Poker positions, stacks, bets, and showdown hands**

- In `PlayerInfo.tsx`, when `playingTable.gameType === "poker"`:
  - Show position badges (`D`, `SB`, `BB`) next to the player's name when `dealerId` / `smallBlindId` / `bigBlindId` match `gamePlayer.id`.
  - Show `Stack: {gamePlayer.stack ?? 0}` badge alongside net `ChipCount`.
  - During play or at game end, show status badges (`Folded`, `All-In`, `Bet: {streetBet}`, or at showdown the hand rank label e.g. `Full House` and `+{handWonChips}`).
- In `GamePlayer.tsx`, when `playingTable.gameType === "poker"`:
  - Sort cards with `getSortedPokerCards`.
  - Allow free sorting (`setSortingLocked(false)` when entering `"playing"`).
  - Do not pass `gamePlayer` tiger prop to `<Cards>`.
  - Show crown `👑` on all `winnerIds` at hand end.

- [ ] **Step 4: Update `HowToPlay.tsx` for Poker rules**

- Add `pokerRulesSections` and select it when `playingTable?.gameType === "poker"`.

- [ ] **Step 5: Run verification and commit**

Run: `npm run build && npm run lint`
Expected: PASS with 0 errors.

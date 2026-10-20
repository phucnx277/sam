# Texas Hold'em No-Limit Poker Implementation Design

Date: 2026-10-20
Status: approved (autonomous flow)

## Problem

The application currently supports playing "Sâm" (Sâm lốc) and "Phỏm" (Tá lả). We want to add full support for **No-Limit Texas Hold'em Poker** (`gameType: "poker"`) with two table modes (**Cash Game** and **Tournament**), complete betting streets (Pre-flop, Flop, Turn, River, Showdown), side pots, 7-card best-5 hand evaluation, and host controls for stacks and blinds/antes between hands.

## Decision

- Extend `GameType` to `"sam" | "phom" | "poker"`, selectable when creating a table in `NewTable.tsx`.
- Support 2–9 players (default `6`) on Poker tables.
- Support two Poker table modes (`pokerMode: "cash" | "tournament"`, defaulting to `"cash"`):
  - **Cash Game (`"cash"`)**:
    - Table creation configures initial **Buy-in / Stack** (`buyIn`, default `1000`), **Small Blind** (`smallBlind`, default `5`), **Big Blind** (`bigBlind`, default `10`), and **Ante** (`ante`, default `0`).
    - Joining players start with `stack = table.buyIn`, `buyIn = table.buyIn`, and net P&L `chipCount = 0` (`chipCount = stack - buyIn`).
    - Between hands (`state === "waiting"` or `"ended"`), the **Host** can add chips to any player's stack (incrementing both `stack` and `buyIn`, preserving `chipCount = stack - buyIn`) and adjust `smallBlind`, `bigBlind`, and `ante`.
  - **Tournament (`"tournament"`)**:
    - Table creation configures **Buy-in / Starting Stack** (`buyIn`, default `1000`), **Small Blind** (`smallBlind`, default `5`), **Big Blind** (`bigBlind`, default `10`), and **Ante** (`ante`, default `0`).
    - Players start with `stack = table.buyIn`, `buyIn = table.buyIn`, and `chipCount = 0`.
    - Players with `stack <= 0` are busted and cannot ready or be dealt into new hands until `resetSession` resets everyone's stack to `table.buyIn`.
    - Between hands, the **Host** can increase `smallBlind`, `bigBlind`, and `ante` (never below their current values).
    - When only 1 player remains with `stack > 0` after a hand ends, `newGame` is disabled (tournament complete; `resetSession` starts a fresh tournament).
- Implement full **No-Limit Texas Hold'em** rules:
  - **Positions & Blinds**:
    - Dealer button (`dealerId`) rotates clockwise each hand among ready players with `stack > 0`.
    - **Heads-Up (2 active players)**: Dealer is Small Blind (`smallBlindId`) and acts first pre-flop, last post-flop. Non-dealer is Big Blind (`bigBlindId`) and acts last pre-flop, first post-flop.
    - **3+ active players**: Left of Dealer is Small Blind, left of Small Blind is Big Blind, left of Big Blind (UTG) acts first pre-flop; first active player left of Dealer acts first post-flop.
    - If `ante > 0`, every active player posts `min(stack, ante)` into the pot before blinds are posted.
    - Small Blind posts `min(stack, smallBlind)` (`streetBet`), Big Blind posts `min(stack, bigBlind)` (`streetBet`).
  - **Betting Actions (`fold`, `check`, `call`, `raise`, `allIn`)**:
    - **Fold**: player forfeits the hand (`foldedHand = true`). If only 1 non-folded player remains, the hand ends immediately (`pokerWinType = "fold"`) and that player takes the pot without revealing cards or dealing remaining streets.
    - **Check**: legal when `player.streetBet === game.currentBet`.
    - **Call**: legal when `player.streetBet < game.currentBet` and `player.stack > 0`; commits `min(player.stack, game.currentBet - player.streetBet)`.
    - **Bet / Raise**: legal when `player.stack > game.currentBet - player.streetBet`. Minimum total street bet is `min(player.streetBet + player.stack, game.currentBet === 0 ? table.bigBlind : game.currentBet + game.minRaise)`; maximum is `player.streetBet + player.stack` (All-In). Full raises update `game.minRaise = newStreetBet - game.currentBet` and reopen action for other active players.
    - **All-In**: commits all remaining `player.stack`.
  - **Streets & All-In Runout**:
    - Streets progress `preflop` (0 community cards) → `flop` (3 cards) → `turn` (4 cards) → `river` (5 cards) → `showdown`.
    - If a betting round closes and fewer than 2 non-folded players still have `stack > 0` (everyone else is All-In), all remaining community cards up to 5 are dealt immediately and the hand goes straight to showdown.
  - **7-Card Hand Evaluation & Side Pots**:
    - Evaluates best 5-card poker hand out of 7 cards (2 hole + 5 community): High Card (`0`), One Pair (`1`), Two Pair (`2`), Three of a Kind (`3`), Straight (`4`, including `A-2-3-4-5` wheel and `10-J-Q-K-A` broadway), Flush (`5`), Full House (`6`), Four of a Kind (`7`), Straight Flush / Royal Flush (`8`).
    - Slices player `totalBet` contributions into main pot and side pots so all-in players can only win up to their contribution level from each opponent, and any uncalled excess bet is automatically returned.
    - Split pots divide evenly among tied winners, with odd remainder chips awarded in clockwise order starting left of the Dealer button.

## Approaches Considered

- **Approach A (Chosen): Unified `Table`/`Game`/`ActionDef` shell with dedicated `src/logic/poker.ts` engine.**
  - Keeps PeerJS + Ably transport, lobby, chat, timers, and player management unified while isolating all NLHE betting, side-pot math, 7-card hand evaluation, and host blind/stack controls in `src/logic/poker.ts`.
- **Approach B: Separate Poker state store & transport messages.**
  - Rejected: duplicates PeerJS/Ably synchronization and table lifecycle.
- **Approach C: Inline Poker rules into `src/logic/game.ts` and `src/logic/card.ts`.**
  - Rejected: `game.ts` is already large, and Sâm's `2 > A > K` rank order differs from Poker's `A > K > Q > J > 10 ... > 2` (with `A` also low in `5-high` straight).

## Architecture & Data Model

### 1. Types (`src/type.d.ts`)

- `GameType = "sam" | "phom" | "poker"`
- `PokerMode = "cash" | "tournament"`
- `PokerStreet = "preflop" | "flop" | "turn" | "river" | "showdown"`
- `PokerHandCategory = "highCard" | "onePair" | "twoPair" | "threeOfAKind" | "straight" | "flush" | "fullHouse" | "fourOfAKind" | "straightFlush" | "royalFlush"`
- `PokerWinType = "fold" | "showdown" | null`
- Extend `GamePlayer`:
  - `stack?: number` — active betting chips on the table.
  - `buyIn?: number` — cumulative chips bought in / added during the session (so `chipCount = stack - buyIn`).
  - `streetBet?: number` — chips bet on the current street.
  - `totalBet?: number` — total chips committed in the current hand (including ante + all streets).
  - `foldedHand?: boolean` — whether player folded in the current hand.
  - `allIn?: boolean` — whether player is all-in (`stack === 0` while active in hand).
  - `actedOnStreet?: boolean` — whether player has acted since the last full raise on the current street.
  - `pokerHandRank?: PokerHandCategory` — evaluated best hand category at showdown.
  - `bestHandCards?: Card[]` — the 5 cards forming the player's best hand at showdown.
  - `handWonChips?: number` — total pot chips won by this player at hand end.
- Extend `TablePlayer`:
  - `stack?: number`
  - `buyIn?: number`
- Extend `PlayerAction`:
  - Add `"fold" | "check" | "call" | "raise" | "allIn" | "updatePokerConfig" | "addPokerChips"`.
- Extend `Game`:
  - `pokerStreet?: PokerStreet`
  - `communityCards?: Card[]`
  - `pot?: number`
  - `currentBet?: number`
  - `minRaise?: number`
  - `dealerId?: string | null`
  - `smallBlindId?: string | null`
  - `bigBlindId?: string | null`
  - `pokerWinType?: PokerWinType`
  - `winnerIds?: string[]`
- Extend `Table`:
  - `pokerMode?: PokerMode` — `"cash"` (default) or `"tournament"`.
  - `buyIn?: number` — starting stack / default buy-in (default `1000`).
  - `smallBlind?: number` — small blind amount (default `5`).
  - `bigBlind?: number` — big blind amount (default `10`).
  - `ante?: number` — per-player ante amount (default `0`).

### 2. Poker Engine (`src/logic/poker.ts`)

1. **Card & 7-Card Hand Evaluator:**
   - `getPokerCardValue(card: Card): number` → `card.rank === 1 ? 14 : card.rank` (`2..14`).
   - `getSortedPokerCards(cards: Card[], descending: boolean): Card[]` → sorts by Poker rank (`A` high) then suit.
   - `evaluatePokerHand(cards: Card[]): { score: number[]; category: PokerHandCategory; bestFive: Card[] }`:
     - Evaluates all `C(n, 5)` 5-card combinations (for `n = 5..7`, at most 21 combinations) and picks the lexicographically highest `score` tuple `[categoryIndex, ...tiebreakerRanks]`.
     - Properly detects `A-2-3-4-5` wheel straight (`5`-high straight) as well as `10-J-Q-K-A` (`14`-high straight / Royal Flush).
   - `compareScores(a: number[], b: number[]): number` → compares two score tuples element-by-element.

2. **Pot & Side Pot Settlement (`settlePokerPots`):**
   - Collects all players who contributed `totalBet > 0`.
   - Builds side pot slices from sorted distinct `totalBet` levels of non-folded players:
     - For each level `L_i` (with previous level `L_{i-1}`, delta `d = L_i - L_{i-1}`):
       - `sliceAmount = sum over all players p of max(0, min(p.totalBet, L_i) - L_{i-1})`.
       - `eligiblePlayers = non-folded players with p.totalBet >= L_i`.
       - Evaluates `evaluatePokerHand([...p.cards, ...communityCards])` for each eligible player, finds the highest score, and splits `sliceAmount` evenly among tied winners (distributing `sliceAmount % winners.length` one chip at a time clockwise starting left of `dealerId`).
     - Any contribution above the maximum `totalBet` of non-folded players is returned to the contributor.
   - Updates each player's `stack += handWonChips` and `chipCount = stack - buyIn`.

3. **Game Lifecycle & Betting Handlers:**
   - `startPokerGame(table: Table): Game`:
     - Filters ready players with `stack > 0` (at least 2 required).
     - Selects `dealerId` (first hand: host if ready with `stack > 0`, else first active player; subsequent hands: next active player clockwise after `lastGame.dealerId`).
     - Assigns `smallBlindId` and `bigBlindId` (Heads-Up: dealer is SB, other is BB; 3+ players: left of dealer is SB, left of SB is BB).
     - Deducts `ante = min(stack, table.ante ?? 0)` from every active player, then `sb = min(stack, table.smallBlind)` from SB (`streetBet = sb`) and `bb = min(stack, table.bigBlind)` from BB (`streetBet = bb`).
     - Deals 2 hole cards to each active player, stores remaining 52-card shuffled deck in `game.deck`.
     - Sets `pokerStreet = "preflop"`, `currentBet = table.bigBlind`, `minRaise = table.bigBlind`, `pot = sum(totalBet)`.
     - Sets first player to act (`currentPlayerId`): left of BB (which in Heads-Up is Dealer/SB, and in 3+ players is UTG). If fewer than 2 players have `stack > 0` after blinds/antes, runs out all 5 community cards and settles showdown immediately.
   - `canFold`, `handleFold`:
     - Marks `foldedHand = true`, `lastAction = "fold"`. Advances turn or ends hand immediately if 1 non-folded player remains.
   - `canCheck`, `handleCheck`:
     - Valid when `player.streetBet === game.currentBet`. Marks `actedOnStreet = true`, `lastAction = "check"`, advances turn/street.
   - `canCall`, `handleCall`:
     - Valid when `player.streetBet < game.currentBet` and `player.stack > 0`. Commits `callAmt = min(player.stack, game.currentBet - player.streetBet)`. Marks `actedOnStreet = true`, `lastAction = player.stack === 0 ? "allIn" : "call"`, advances turn/street.
   - `getRaiseBounds(table: Table, player: GamePlayer): { minTotalBet: number; maxTotalBet: number; canRaise: boolean }`:
     - `callDiff = Math.max(0, game.currentBet - player.streetBet)`.
     - `canRaise = isPlayerTurn && player.stack > callDiff`.
     - `minRaiseTarget = game.currentBet === 0 ? table.bigBlind : game.currentBet + game.minRaise`.
     - `minTotalBet = Math.min(player.streetBet + player.stack, Math.max(minRaiseTarget, game.currentBet + 1))`.
     - `maxTotalBet = player.streetBet + player.stack`.
   - `canRaise`, `handleRaise(table, player, targetStreetBet)`:
     - Commits `added = targetStreetBet - player.streetBet` from `player.stack`.
     - If `targetStreetBet - game.currentBet >= game.minRaise`, updates `game.minRaise = targetStreetBet - game.currentBet` and resets `actedOnStreet = false` for all other active players.
     - Updates `game.currentBet = targetStreetBet`, marks `player.actedOnStreet = true`, `lastAction = player.stack === 0 ? "allIn" : "raise"`, advances turn/street.
   - `canAllIn`, `handleAllIn(table, player)`:
     - If `player.streetBet + player.stack <= game.currentBet`, delegates to `handleCall`; otherwise delegates to `handleRaise(table, player, player.streetBet + player.stack)`.
   - `handlePokerAutoAction(table, player)`:
     - On turn timeout: if `canCheck(table.game, player)` → `handleCheck`, else → `handleFold`.
   - `handleUpdatePokerConfig(table, player, { smallBlind, bigBlind, ante })`:
     - Host-only between hands (`!isGameInProgress`). In Tournament mode, enforces `smallBlind >= table.smallBlind`, `bigBlind >= table.bigBlind`, `ante >= (table.ante ?? 0)` and `bigBlind >= smallBlind`. In Cash mode, allows any valid `smallBlind >= 1`, `bigBlind >= smallBlind`, `ante >= 0`.
   - `handleAddPokerChips(table, player, { targetPlayerId, amount })`:
     - Host-only between hands in Cash mode (`pokerMode === "cash"`). Adds `amount > 0` to `targetPlayer`'s `stack` and `buyIn` (both in `game.players` and `table.players`), keeping `chipCount = stack - buyIn`.

### 3. UI Components

1. **`NewTable.tsx`**:
   - Add `"poker"` button (`Poker`) to the game type segmented selector (`Sâm` | `Phỏm` | `Poker`).
   - When `gameType === "poker"`:
     - Sub-selector for `Cash Game` (`"cash"`) vs `Tournament` (`"tournament"`).
     - Inputs for `buyIn` (default `1000`), `smallBlind` (default `5`), `bigBlind` (default `10`), `ante` (default `0`), `playerLimit` (2–9, default `6`), and `turnTimeout` (0–90, default `0`).
2. **`PlayingTable.tsx`**:
   - Left info column shows `Cash` / `Tourney` badge, `Blinds: {smallBlind}/{bigBlind}` (and `Ante: {ante}` if `> 0`).
   - Center board in Poker mode displays:
     - Total **Pot** badge (`Pot: {pot}`) and current street badge (`Pre-flop` / `Flop` / `Turn` / `River` / `Showdown`).
     - The **Community Cards** (up to 5 `<OneCard>` / `<Cards>` or clearly styled playing cards in the center).
     - Action controls in `Actions.tsx`.
3. **`Actions.tsx`**:
   - In Poker mode during `"playing"` when it is the local player's turn:
     - Left group: `Fold`, `Check` / `Call ({amount})`.
     - Right group: `Raise` / `Bet` control with an inline amount selector (quick buttons `Min`, `1/2 Pot`, `Pot`, `All-In` + number/range input) and `All-In` button.
   - Between hands (`waiting` / `ended`):
     - `Ready` checkbox (disabled in Tournament if `stack <= 0`), `Deal` / `New Game`, `Reset Session`.
4. **`GamePlayer.tsx` & `PlayerInfo.tsx`**:
   - Shows position badges next to player name: `D` (Dealer), `SB` (Small Blind), `BB` (Big Blind).
   - Shows player's active **Stack** (`Stack: {stack}`) alongside net session `ChipCount` (`chipCount`).
   - Shows player's current street bet badge (`Bet: {streetBet}`), plus status badges (`Folded`, `All-In`, `Check`, `Call`, `Raise`).
   - At showdown (`state === "ended"`), reveals non-folded players' hole cards and shows their evaluated hand category badge (`One Pair`, `Flush`, `Full House`, etc.) and `+{handWonChips}` for winners.
5. **`TableInfo.tsx`**:
   - Displays Poker mode (`Cash Game` / `Tournament`), `Buy-in`, `Blinds (SB/BB)`, `Ante`, and each player's `Stack` + net `chipCount`.
   - When the local player is Host and no hand is in progress (`!isGameInProgress`):
     - **Blinds / Ante editor**: inputs for `SB`, `BB`, `Ante` (with Tournament min-lock so host can increase blinds before the next deal).
     - **Add Chips control (Cash Game only)**: allows host to select a player (or click `+ Chips` on a player) and add chips to their `stack` before the next deal.
6. **`HowToPlay.tsx` & Locales (`src/locales/vi.ts`, `src/locales/en.ts`)**:
   - Full Vietnamese and English translations for all Poker labels, hand rankings, actions, table settings, and How-To-Play guide sections.

## Verification

- `npm run build` (`tsc -b && vite build`) passes with zero errors.
- `npm run lint` passes with zero warnings/errors.
- Unit/logic verification script run via `ctx_execute` testing:
  - 7-card hand evaluation across all 9 hand categories + wheel/broadway straights + tie-breakers.
  - Heads-up and multi-way blind posting, street progression, all-in runout, and side-pot splitting.
  - Cash game chip top-up & blind edits vs Tournament blind increases & bust-out rules.

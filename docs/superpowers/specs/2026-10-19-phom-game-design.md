# Phỏm Game Implementation Design

Date: 2026-10-19
Status: approved (autonomous flow)

## Problem

The application currently supports playing "Sâm" (Sâm lốc) only. We want to add full support for the traditional Northern Vietnamese "Phỏm" (Tá lả / Ù) card game (per https://vi.wikipedia.org/wiki/Ph%E1%BB%8Fm) alongside Sâm, allowing hosts to choose either Sâm or Phỏm when creating a table.

## Decision

- Support both **Sâm** and **Phỏm** in the same app, selected per table at table creation time (`table.gameType: "sam" | "phom"`, defaulting to `"sam"`).
- Implement the full Northern Phỏm ruleset from Wikipedia:
  - 2–4 players; starter gets 10 cards, other ready players get 9 cards, remainder forms the draw pile (**Nọc**).
  - Card values and points: `A = 1, 2 = 2, ..., 10 = 10, J = 11, Q = 12, K = 13`.
  - **Phỏm ngang** (3–4 cards of the same rank) and **Phỏm dọc** (3+ consecutive cards of the same suit, `A` low to `K` high).
  - **Ù khan**: dealt hand with no **cạ** (no pair of same rank, and no two same-suit cards with rank difference `<= 2`) wins immediately after dealing.
  - Turn flow: **Ăn** (eat previous player's last discard if it forms a valid Phỏm with hand without breaking earlier eaten cards' Phỏms) or **Bốc** (draw from Nọc), followed by **Đánh** (discard 1 trash card).
  - **Tời bài (Né hạ & Thêm vòng)**: eating a discard removes it from the feeder's discard pile and shifts 1 discard along the chain from the current round leader to the feeder, naturally producing both *né hạ* and *thêm vòng*.
  - **Hạ phỏm & Gửi bài**: when a player has 3 discards (before their 4th discard, or on an extra round turn after already melding), they manually select and lay down their Phỏms (**Hạ phỏm**) and may attach remaining cards to any already-laid-down Phỏms on the table (**Gửi bài**) before discarding. All eaten cards must be melded.
  - **Ù** (normal 3 Phỏms / 0 remaining points, **Ù gửi**, **Ù tròn** with 0 cards left in hand, **Ù đền** when eating 3 cards or eating after feeder melded to Ù).
- Chip settlement & table multiplier (`table.multiplier`, default `10`, configurable on Phỏm table creation):
  - Normal game end (all players reach 4 discards without Ù):
    - Non-Móm players are ranked by lowest remaining card points (ties broken by who lowered melds earlier).
    - **Nhì (2nd)** pays `1 * multiplier` to **Nhất (1st)**.
    - **Ba (3rd)** pays `2 * multiplier` to **Nhất (1st)**.
    - **Bét (4th)** pays `3 * multiplier` to **Nhất (1st)**.
    - **Cháy / Móm** (no Phỏm laid down) pays `4 * multiplier` to **Nhất (1st)**.
  - **Ù** (including Ù thường, Ù gửi, Ù tròn, Ù khan): each loser pays `5 * multiplier` to the winner.
  - **Đền** (feeding 3 eaten cards to the next player, triggering Ù): feeder pays `15 * multiplier` to the winner on behalf of the table.
  - **Ăn cây 1 / 2 / chốt**: feeder immediately transfers `1 * multiplier` (1st eaten card), `2 * multiplier` (2nd eaten card), or `4 * multiplier` (cây chốt — 3rd-round discard or post-meld discard) to the eater.

## Approaches Considered

- **Approach A (Chosen): Unified `Table`/`Game`/`ActionDef` shell with dedicated `src/logic/phom.ts` rules engine.**
  - Keeps transport (PeerJS + Ably fallback), lobby, chat, and player state management completely unified while isolating all Phỏm combinatorics, turn phases, meld/send validation, and scoring in `src/logic/phom.ts`.
- **Approach B: Separate Phỏm table/game state & components.**
  - Rejected: duplicates PeerJS/Ably sync, table management, chat, and shared UI.
- **Approach C: Inline Phỏm rules into `src/logic/game.ts` and `src/logic/card.ts`.**
  - Rejected: `game.ts` is already >1000 lines and Sâm card rank ordering (`2 > A > K`) conflicts with Phỏm rank ordering (`K > Q > J > ... > A`).

## Architecture & Data Model

### Types (`src/type.d.ts`)

- `GameType = "sam" | "phom"`
- `PhomPhase = "take" | "meld" | "discard"`
- `PhomWinType = "points" | "u" | "uTron" | "uKhan" | "uDen" | null`
- Extend `GamePlayer`:
  - `eatenCards?: Card[]` — cards eaten by this player that are still in `cards` (not yet laid down in `melds`).
  - `discards?: Card[]` — face-up discarded trash cards in front of this player.
  - `melds?: Card[][]` — Phỏms laid down by this player.
  - `hasMelded?: boolean` — whether this player has completed at least one Hạ bài turn.
  - `meldOrder?: number` — 1-based order in which the player lowered melds (for tie-breaking).
  - `eatenCount?: number` — total cards eaten by this player in the current game.
  - `isMom?: boolean` — set at game end if the player had no Phỏms.
  - `score?: number` — remaining card point total at game end.
- Extend `PlayerAction`:
  - Add `"draw" | "eat" | "meld" | "send" | "u"`.
- Extend `Game`:
  - `deck?: Card[]` — remaining cards in Nọc (for Phỏm).
  - `phomPhase?: PhomPhase` — current sub-turn phase (`"take"`, `"meld"`, `"discard"`).
  - `lastDiscardBy?: string | null` — playerId who played the currently eatable discard.
  - `lastDiscardIsChot?: boolean` — whether the currently eatable discard was a cây chốt.
  - `phomWinType?: PhomWinType` — how the Phỏm game ended.
- Extend `Table`:
  - `gameType?: GameType` — `"sam"` (default) or `"phom"`.
  - `multiplier?: number` — chip multiplier for Phỏm (default `10`).

### Phỏm Logic (`src/logic/phom.ts`)

1. **Card & Meld Helpers:**
   - `getPhomCardPoint(card: Card): number` -> `card.rank` (1..13).
   - `getSortedPhomCards(cards: Card[], descending: boolean): Card[]` -> sorts by `rank` (1..13) then suit.
   - `isPhomSet(cards: Card[]): boolean` -> `cards.length >= 3 && cards.length <= 4`, all same rank, distinct suits.
   - `isPhomRun(cards: Card[]): boolean` -> `cards.length >= 3`, all same suit, consecutive ranks `1..13`.
   - `isValidPhom(cards: Card[]): boolean` -> `isPhomSet(cards) || isPhomRun(cards)`.
   - `getSortedPhom(cards: Card[]): Card[]` -> sorts cards by rank ascending.
   - `isUkhan(cards: Card[]): boolean` -> checks that no two cards share a rank and no two same-suit cards have `Math.abs(a.rank - b.rank) <= 2`.
   - `findValidMeldPartitions(hand: Card[], requiredEatenCards: Card[])` -> backtracking search over all valid Phỏms in `hand` to check if all `requiredEatenCards` can be covered by disjoint Phỏms, and to find partitions that leave `<= 1` card (for `canU`).

2. **Turn & Action Handlers:**
   - `startPhomGame(game: Game, playerLimit: number, hostId: string, multiplier: number): Game`:
     - Deals 10 cards to starter (`lastGame.winnerId` or `hostId`) and 9 cards to other ready players; puts remaining cards into `game.deck`.
     - Checks `isUkhan` for ready players in turn order from starter. If found, ends game immediately with `phomWinType = "uKhan"` and settles `5 * multiplier` per opponent.
     - Otherwise sets `state = "playing"`, `round = 1`, `phomPhase = "discard"` for starter (or if starter can Ù immediately, they may also click `Ù`).
   - `canEat(game: Game, player: GamePlayer): boolean`:
     - True in `phomPhase === "take"` when `game.lastPlayedCards.length === 1` and `canEatCard(player.cards, player.eatenCards, game.lastPlayedCards[0])` is true.
   - `handleEat(table: Table, player: GamePlayer): Table`:
     - Removes eaten card `d` from feeder's `discards`, shifts 1 discard along the chain from the current cycle leader to the feeder (`shiftDiscardsOnEat`), adds `d` to `player.cards` and `player.eatenCards`, increments `player.eatenCount`.
     - Settles immediate eat chips between feeder and `player`: `(lastDiscardIsChot ? 4 : eatenCount === 1 ? 1 : 2) * multiplier` (unless `eatenCount === 3`).
     - If `player.eatenCount >= 3`: triggers immediate `uDen` win (`winnerId = player.id`, `faultPlayerId = feeder.id`, feeder pays `15 * multiplier` to `player`).
     - Otherwise transitions `phomPhase` to `"meld"` (if `player.discards.length === 3` or `player.hasMelded`) or `"discard"`.
   - `handleDraw(table: Table, player: GamePlayer): Table`:
     - Shifts 1 card from `game.deck` into `player.cards`, clears `lastPlayedCards`/`lastDiscardBy`, transitions `phomPhase` to `"meld"` (if `player.discards.length === 3` or `player.hasMelded`) or `"discard"`.
   - `canMeld(game: Game, player: GamePlayer, selectedCards: Card[]): boolean`:
     - Valid during `"meld"` or `"discard"` when `player.discards.length === 3 || player.hasMelded`, `selectedCards` forms 1+ disjoint valid Phỏms, and any remaining `eatenCards` can still be melded from the remaining `player.cards`.
   - `handleMeld(table: Table, player: GamePlayer, selectedCards: Card[]): Table`:
     - Moves `selectedCards` from `player.cards` (and `player.eatenCards`) into `player.melds`.
     - If `player.cards.length === 0`, triggers **Ù tròn** (`phomWinType = "uTron"`, settles `5 * multiplier` per opponent).
   - `canSend(game: Game, player: GamePlayer, selectedCards: Card[]): boolean`:
     - Valid when `(player.discards.length === 3 || player.hasMelded)`, `player.melds.length > 0`, `player.eatenCards.length === 0`, `selectedCards.length >= 1`, and there exists a laid-down meld `M` on the table such that `M ∪ selectedCards` is a valid Phỏm.
   - `handleSend(table: Table, player: GamePlayer, selectedCards: Card[]): Table`:
     - Appends `selectedCards` into the matching meld on the table and removes them from `player.cards`.
     - If `player.cards.length === 0`, triggers **Ù** (`phomWinType = "uTron"`, settles `5 * multiplier` per opponent).
   - `canDiscard(game: Game, player: GamePlayer, selectedCards: Card[]): boolean`:
     - Valid in `"meld"` or `"discard"` phase when `selectedCards.length === 1`, the card is not in `player.eatenCards`, and:
       - If `player.discards.length === 3 || player.hasMelded`: `player.eatenCards.length === 0` (all eaten cards have been melded).
       - Else: remaining `player.cards` can still cover all `player.eatenCards` in valid disjoint Phỏms.
   - `handleDiscard(table: Table, player: GamePlayer, selectedCards: Card[]): Table`:
     - Removes card from `player.cards`, appends to `player.discards`.
     - Determines if this discard is a **cây chốt** (`wasHameldedTurn || player.discards.length === 3` before melding, or next player has already melded).
     - If `player.discards.length === 4` (or was in meld turn), marks `player.hasMelded = true` and assigns `player.meldOrder` if not set.
     - If `player.cards.length === 0 && player.melds.length > 0`, triggers **Ù**!
     - Checks if all ready players now have `discards.length === 4`:
       - If the next player cannot eat this last discard (or `game.deck.length === 0` and eating does not give the next player Ù), ends the game by points (`phomWinType = "points"`) and settles ranking chips (`1x / 2x / 3x / 4x Móm`).
       - Otherwise advances turn to next player in `phomPhase = "take"`.
   - `canDeclareU(game: Game, player: GamePlayer): boolean` & `handleDeclareU(table: Table, player: GamePlayer): Table`:
     - Allows a player in `"meld"` or `"discard"` phase whose hand can be partitioned into valid Phỏms (covering all `eatenCards`) with `<= 1` leftover card to declare **Ù** directly in one tap (auto-laying their Phỏms and discarding the 1 leftover card if any).

### UI Components

1. **`NewTable.tsx`**:
   - Segmented button toggle for `Sâm` vs `Phỏm`.
   - In `Phỏm` mode: `playerLimit` is 2–4 (default 4); `multiplier` input replaces `bo` (default 10, min 1).
2. **`PlayingTable.tsx`**:
   - Left info panel shows `Phỏm` badge and `Hệ số: {multiplier}` when `gameType === "phom"`.
   - Center area in Phỏm mode displays the **Nọc** remaining card counter and the last discarded card, plus the Phỏm action buttons in `Actions.tsx`.
3. **`GamePlayer.tsx` & `PlayerInfo.tsx`**:
   - Renders each player's **Phỏm đã hạ (`melds`)** and **Bài đánh (`discards`)** in a compact strip above/beside their hand, and highlights eaten cards in hand so players always see which cards were eaten, which melds are on the table (available for Gửi), and which cards were discarded.
   - At game end, displays points (`{score}đ`), `Móm`, `Ù`, `Ù khan`, `Ù tròn`, crown `👑` for winner, and `🐷` for `paidVillage` (Đền).
4. **`HowToPlay.tsx` & Locales (`vi.ts`, `en.ts`)**:
   - Add localized strings for Phỏm UI, actions (`Bốc`, `Ăn`, `Hạ phỏm`, `Gửi`, `Ù`), badges, and Phỏm How-To-Play rules in both Vietnamese and English.

## Verification

- `npm run build` (`tsc -b && vite build`) passes with zero errors.
- `npm run lint` passes with zero warnings/errors.

# Peer-Mode Reconnect, Presence, and Spectators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make peer-mode players persist their own table metadata, show who is disconnected, and rejoin correctly (resume the same game, or spectate a new game until they explicitly join the next one).

**Architecture:** The host remains the only writer. It observes per-client connection drops and, after a grace period, flags the seat `isDisconnected` + `isAway` (skipping its turn). A reconnecting client's `hello` carries its last-known `gameId`/`cards`, which the host resolves with a pure `applyRejoin` helper: resume when the game is `waiting` or the player still has cards; otherwise keep them a spectator.

**Tech Stack:** React 19, Vite 7, TypeScript, Zustand, PeerJS, Tailwind v4. No test framework — verification is `npm run build`, `npm run lint`, and manual browser checks.

---

## File Structure

- `src/type.d.ts` — add `GamePlayer.isDisconnected`, `LocalGame.tableId`.
- `src/hooks/useLocalGame.ts` — persist `tableId`, add `clearLocalGame()`.
- `src/logic/table.ts` — add `markPlayerDisconnected`, `markPlayerReconnected`, `applyRejoin`.
- `src/logic/game.ts` — make `ready` clear `isAway` (join next game).
- `src/hooks/usePeerData.ts` — host presence grace timers; `hello` metadata fallback; pass rejoin payload to `onJoin`; drop the old card-adoption block.
- `src/hooks/useAppData.ts` — `onJoin` uses `applyRejoin`; clear local metadata on leave/remove.
- `src/components/GamePlayer/GamePlayer.tsx` — save `tableId` with the local game.
- `src/components/GamePlayer/PlayerInfo.tsx` — disconnected / watching badges.
- `src/components/GamePlayer/Actions.tsx` — spectator gating + "join next game".
- `src/locales/vi.ts`, `src/locales/en.ts` — new keys.

Commit after each task. The pre-commit hook runs `npm run build`, bumps the patch version, and `git add -u`; `git add` new files explicitly. If a build fails, fix before committing.

---

### Task 1: Data model + local metadata store

**Files:**
- Modify: `src/type.d.ts`
- Modify: `src/hooks/useLocalGame.ts`

- [ ] **Step 1: Add presence + table id to types**

In `src/type.d.ts`, add `isDisconnected?: boolean;` to `GamePlayer` (after `isAway?: boolean;`) and add `tableId?: string;` to `LocalGame`:

```ts
type LocalGame = {
  playerId: string;
  gameId: string;
  tableId?: string;
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
  isAway?: boolean;
  isDisconnected?: boolean;
};
```

- [ ] **Step 2: Add `clearLocalGame` to the store**

Replace the store body in `src/hooks/useLocalGame.ts` with:

```ts
const gameStore = create<{
  localGame: LocalGame | null;
  localCards: Card[];
  setLocalGame: (data: LocalGame) => void;
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>;
  clearLocalGame: () => void;
}>((set) => ({
  localGame: getLocalGame(),
  localCards: [],
  setLocalGame: (data: LocalGame) => {
    setLocalGame(data);
    set({ localGame: data });
  },
  setLocalCards: (fn: Card[] | ((cards: Card[]) => Card[])) => {
    set((state) => {
      let data: Card[] = fn as Card[];
      if ("function" === typeof fn) {
        data = fn(state.localCards);
      }
      return { localCards: data };
    });
  },
  clearLocalGame: () => {
    localStorage.removeItem(LS_PLAYING_GAME_KEY);
    set({ localGame: null, localCards: [] });
  },
}));
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS (no new type errors).

- [ ] **Step 4: Commit**

```bash
git add src/type.d.ts src/hooks/useLocalGame.ts
git commit -m "feat(peer): add presence fields and local table metadata"
```

---

### Task 2: Pure presence / rejoin helpers

**Files:**
- Modify: `src/logic/table.ts`

- [ ] **Step 1: Add helpers at the end of `src/logic/table.ts`**

`findNextActivePlayerId` is already imported from `./game`. Append:

```ts
const updateTurnWindow = (game: Game): void => {
  game.turnStartTs = Date.now();
  game.turnEndTs =
    game.turnTimeout > 0 ? game.turnStartTs + game.turnTimeout * 1000 : -1;
};

export const markPlayerDisconnected = (
  table: Table,
  playerId: string,
): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp) return table;
  const game: Game = {
    ...table.game,
    players: table.game.players.map((item) =>
      item.id === playerId
        ? { ...item, isDisconnected: true, isAway: true }
        : item,
    ),
  };
  const inProgress =
    game.state === "playing" || game.state === "handChecking";
  if (inProgress && game.currentPlayerId === playerId) {
    game.currentPlayerId = findNextActivePlayerId(game, playerId);
    updateTurnWindow(game);
  }
  return { ...table, game, updatedAt: Date.now() };
};

export const applyRejoin = (
  table: Table,
  playerId: string,
  rejoin: { gameId?: string; cards?: Card[] },
): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp) return table;
  const inProgress =
    table.game.state === "playing" || table.game.state === "handChecking";
  const sameGame = !!rejoin.gameId && rejoin.gameId === table.game.id;
  const canResume = table.game.state === "waiting" || gp.cards.length > 0;
  const adoptCards =
    canResume &&
    inProgress &&
    sameGame &&
    !!rejoin.cards?.length &&
    (gp.cards.length === 0 || hasHiddenCards(gp.cards));

  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((item) => {
        if (item.id !== playerId) return item;
        return {
          ...item,
          isDisconnected: false,
          isAway: canResume ? false : true,
          cards: adoptCards
            ? rejoin.cards!.map((card) => ({
                rank: card.rank,
                suit: card.suit,
              }))
            : item.cards,
        };
      }),
    },
    updatedAt: Date.now(),
  };
};
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/logic/table.ts
git commit -m "feat(peer): add presence and rejoin pure helpers"
```

---

### Task 3: `ready` joins the next game

**Files:**
- Modify: `src/logic/game.ts:149-165`

- [ ] **Step 1: Replace the `ready` handler**

In the `ready` entry of `ActionDef`, replace `handleAction` with:

```ts
    handleAction(playingTable: Table, currentPlayer?: GamePlayer): Table {
      return {
        ...playingTable,
        game: {
          ...playingTable.game,
          players: playingTable.game.players.map((gamePlayer) => {
            if (gamePlayer.id !== currentPlayer?.id) return gamePlayer;
            if (gamePlayer.isAway) {
              return { ...gamePlayer, isAway: false, isReady: true };
            }
            return { ...gamePlayer, isReady: !gamePlayer.isReady };
          }),
        },
      };
    },
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/logic/game.ts
git commit -m "feat(peer): ready action rejoins a spectating player"
```

---

### Task 4: Host presence detection + rejoin protocol

**Files:**
- Modify: `src/hooks/usePeerData.ts`

- [ ] **Step 1: Update imports and constants**

Replace the `@logic/table` import block (lines 10-16) with:

```ts
import {
  markPlayerDisconnected,
  maskTableFor,
  promoteHost,
  validateJoin,
  type JoinRejectReason,
} from "@logic/table";
import useLocalGame from "@hooks/useLocalGame";
```

Add near the other timing constants:

```ts
const PLAYER_AWAY_GRACE_MS = 10000;
```

Add to the module-level mutable state (with the other `let` declarations):

```ts
let presenceTimers: Map<string, number> = new Map();
```

- [ ] **Step 2: Presence timer helpers + clear them**

Immediately before `const clearConnectTimer = ...`, add:

```ts
const clearPresenceTimer = (playerId: string): void => {
  const timer = presenceTimers.get(playerId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    presenceTimers.delete(playerId);
  }
};

const clearPresenceTimers = (): void => {
  presenceTimers.forEach((timer) => window.clearTimeout(timer));
  presenceTimers = new Map();
};
```

In `clearTimers`, add `clearPresenceTimers();` as the first line:

```ts
const clearTimers = (): void => {
  clearPresenceTimers();
  clearConnectTimer();
  if (hostRetryTimer !== null) {
    window.clearTimeout(hostRetryTimer);
    hostRetryTimer = null;
  }
  if (graceTimer !== null) {
    window.clearTimeout(graceTimer);
    graceTimer = null;
  }
  if (electionTimer !== null) {
    window.clearTimeout(electionTimer);
    electionTimer = null;
  }
};
```

- [ ] **Step 3: Extend the `onJoin` callback type**

In `export type PeerCallbacks`, change `onJoin` to:

```ts
  onJoin: (
    player: Player,
    table: Table,
    rejoin: { gameId?: string; cards?: Card[] },
  ) => Table | null;
```

- [ ] **Step 4: Host drop handler**

Inside `startHost`, the `peer.on("connection", ...)` handler currently ends with two blocks:

```ts
        conn.on("close", () => {
          if (mySession !== session) return;
          set({
            clientConns: get().clientConns.filter((c) => c.conn !== conn),
          });
        });

        conn.on("error", () => {
          if (mySession !== session) return;
          set({
            clientConns: get().clientConns.filter((c) => c.conn !== conn),
          });
        });
```

Replace both with:

```ts
        const schedulePresence = () => {
          if (mySession !== session) return;
          const info = get().clientConns.find((c) => c.conn === conn);
          set({
            clientConns: get().clientConns.filter((c) => c.conn !== conn),
          });
          const playerId = info?.playerId;
          if (!playerId || playerId === get().selfPlayer?.id) return;
          clearPresenceTimer(playerId);
          presenceTimers.set(
            playerId,
            window.setTimeout(() => {
              presenceTimers.delete(playerId);
              if (mySession !== session) return;
              const state = get();
              if (state.role !== "host") return;
              if (state.clientConns.some((c) => c.playerId === playerId)) {
                return;
              }
              const table = state.latestTable;
              if (
                !table ||
                !table.game.players.some((item) => item.id === playerId)
              ) {
                return;
              }
              const next = markPlayerDisconnected(table, playerId);
              if (next === table) return;
              const rev = state.rev + 1;
              set({ latestTable: next, rev });
              broadcastTable(next, rev, playerId);
              state.callbacks?.onUpdate(next, rev);
            }, PLAYER_AWAY_GRACE_MS),
          );
        };

        conn.on("close", schedulePresence);
        conn.on("error", schedulePresence);
```

- [ ] **Step 5: Clear presence timer + rejoin on `hello`**

In the same `startHost` `conn.on("data")` handler, inside `if (msg.type === "hello")`, after the block that adds the conn to `clientConns`, insert:

```ts
            clearPresenceTimer(msg.playerId);
```

Then replace this block:

```ts
            const merged = get().callbacks?.onJoin(joining, latest);
```

with:

```ts
            const merged = get().callbacks?.onJoin(joining, latest, {
              gameId: msg.gameId,
              cards: msg.cards,
            });
```

Finally delete the entire legacy card-adoption block (the `if (msg.cards?.length && msg.gameId && ... ) { ... }` block that rebuilds `latest.game.players`), so the handler goes straight from the `merged` block to:

```ts
            safeSend(conn, {
              type: "snapshot",
              table: maskTableFor(latest, joining.id),
              rev: get().rev,
              from: joining.id,
            });
```

- [ ] **Step 6: `hello` metadata fallback in `joinHost`**

In `joinHost`'s `conn.on("open", ...)`, replace the block that builds `latest`/`self` and sends `hello` with:

```ts
        conn.on("open", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          connectAttempt = 0;
          signalingAttempt = 0;
          wasConnected = true;
          clearGraceTimer();
          endElection();
          setFallback(false, cb);
          const latest = get().latestTable;
          const self = latest?.game.players.find(
            (item) => item.id === player.id,
          );
          const local = useLocalGame.getState().localGame;
          const localMatches =
            local?.tableId === tableId && local?.playerId === player.id;
          const cards =
            (self?.cards?.length ? self.cards : undefined) ??
            (localMatches ? local?.cards : undefined);
          const gameId =
            latest?.game.id ?? (localMatches ? local?.gameId : undefined);
          safeSend(conn, {
            type: "hello",
            playerId: player.id,
            name: player.name,
            password,
            cards,
            gameId,
          });
        });
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/usePeerData.ts
git commit -m "feat(peer): host presence grace timers and rejoin handshake"
```

---

### Task 5: Wire rejoin in `useAppData` + clear metadata

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Swap the table import and add `useLocalGame`**

Change the `@logic/table` import to drop `resumePlayer` and add `applyRejoin`:

```ts
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  applyRejoin,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
```

Add after the `useLocalPlayer` import:

```ts
import useLocalGame from "@hooks/useLocalGame";
```

- [ ] **Step 2: Replace `bridge.onJoin`**

Replace the entire `onJoin` entry in the `bridge` object with:

```ts
  onJoin: (player, table, rejoin) => {
    const present = table.game.players.some((item) => item.id === player.id);
    if (!present) {
      if (table.game.players.length >= table.playerLimit) {
        return null;
      }
      const merged = addTablePlayer(table, player);
      void persistTableToAbly(merged);
      return merged;
    }
    const merged = applyRejoin(table, player.id, rejoin);
    if (merged !== table) {
      void persistTableToAbly(merged);
    }
    return merged;
  },
```

- [ ] **Step 3: Clear local metadata on leave / remove**

In `leaveTable`, add `useLocalGame.getState().clearLocalGame();` before `unsetPlayingTable()`:

```ts
  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    stopPolling();
    useAblyStore.setState({ isPeerFallback: false });
    useLocalGame.getState().clearLocalGame();
    unsetPlayingTable();
  }, [unsetPlayingTable]);
```

In `removeTable`, add `useLocalGame.getState().clearLocalGame();` in both places that call `unsetPlayingTable()`:

```ts
      if (useAblyStore.getState().mode === "peer") {
        const tables = useAblyStore
          .getState()
          .tables.filter((item) => item.id !== tableId);
        useAblyStore.setState({ tables });
        if (
          usePeerData.getState().tableId === tableId ||
          useAblyStore.getState().playingTable?.id === tableId
        ) {
          usePeerData.getState().stop();
          stopPolling();
          useLocalGame.getState().clearLocalGame();
          unsetPlayingTable();
        }
        return null;
      }
```

```ts
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          stopPolling();
          useAblyStore.setState({ isPeerFallback: false });
          useLocalGame.getState().clearLocalGame();
          unsetPlayingTable();
        }
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat(peer): resolve rejoin via applyRejoin and clear local metadata"
```

---

### Task 6: Persist `tableId` with the local game

**Files:**
- Modify: `src/components/GamePlayer/GamePlayer.tsx:60-67`

- [ ] **Step 1: Add `tableId` to the saved object**

Replace the effect body that calls `setLocalGame` with:

```ts
  useEffect(() => {
    if (!isMe || !playingTable!.game) return;
    setLocalGame({
      playerId: localPlayer!.id,
      gameId: playingTable!.game.id,
      tableId: playingTable!.id,
      cards: localCards,
    });
  }, [localCards]);
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/GamePlayer/GamePlayer.tsx
git commit -m "feat(peer): store table id in local game metadata"
```

---

### Task 7: Presence badges + spectator controls

**Files:**
- Modify: `src/components/GamePlayer/PlayerInfo.tsx`
- Modify: `src/components/GamePlayer/Actions.tsx`

- [ ] **Step 1: Add badges in `PlayerInfo.tsx`**

Inside the `<div className="flex items-center justify-center gap-x-2">` that contains the name (right after `<span>{gamePlayer.name}</span>`), add:

```tsx
            {!isMe && gamePlayer.isDisconnected && (
              <span className="ml-1 text-[0.65rem] px-1 rounded-sm bg-gray-300 text-gray-700">
                {t("game.disconnected")}
              </span>
            )}
            {!isMe && gamePlayer.isAway && !gamePlayer.isDisconnected && (
              <span className="ml-1 text-[0.65rem] px-1 rounded-sm bg-amber-200 text-amber-900">
                {t("game.watching")}
              </span>
            )}
```

- [ ] **Step 2: Spectator gating in `Actions.tsx`**

At the start of the component body (right after `const ds = useCountDown(...)`), add:

```ts
    const isSpectator = !!gamePlayer.isAway;
```

Replace the whole `return (...)` block with:

```tsx
  return (
    <>
      {isGameInProgress(playingTable!.game) && !isSpectator && (
        <div className="w-full flex items-center">
          <div className="flex-1 flex justify-start">
            {renderTwoStepButtonActions(["pass", "ask"])}
          </div>
          <div className="flex-1 flex justify-end">
            {renderTwoStepButtonActions(["play", "tiger"])}
          </div>
        </div>
      )}

      {isGameInProgress(playingTable!.game) && isSpectator && (
        <div className="w-full text-center text-sm py-1 rounded-sm bg-amber-100 text-amber-900">
          {t("game.watching")}
        </div>
      )}

      {!isGameInProgress(playingTable!.game) && (
        <div className="w-full flex items-center justify-center gap-8 bg-cyan-50/60">
          {playingTable!.game.state === "waiting" && (
            <div className="flex flex-col gap-4 min-w-[8rem]">
              {isSpectator ? (
                <button
                  className="!px-4 !py-1 border-2 border-green-600 bg-green-600 rounded-sm font-semibold"
                  onClick={() =>
                    onAction("ready", { actingPlayerId: gamePlayer.id })
                  }
                >
                  {t("game.joinNextGame")}
                </button>
              ) : (
                <>
                  <div className="flex justify-between items-center gap-4">
                    {renderActions(["ready", "star"])}
                  </div>
                  {renderActions(["startGame"])}
                </>
              )}
            </div>
          )}
          {playingTable!.game.state === "ended" && (
            <div className="flex flex-col gap-2 min-w-[8rem]">
              {renderActions(["newGame", "resetSession"])}
            </div>
          )}
        </div>
      )}
    </>
  );
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/GamePlayer/PlayerInfo.tsx src/components/GamePlayer/Actions.tsx
git commit -m "feat(peer): show presence badges and gate spectator controls"
```

---

### Task 8: i18n keys

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add Vietnamese keys**

After `"game.fallbackMode": "Kết nối gián tiếp",` in `src/locales/vi.ts`, add:

```ts
  "game.disconnected": "Mất kết nối",
  "game.watching": "Đang xem",
  "game.joinNextGame": "Vào ván sau",
```

- [ ] **Step 2: Add English keys**

After `"game.fallbackMode": "Indirect connection",` in `src/locales/en.ts`, add:

```ts
  "game.disconnected": "Disconnected",
  "game.watching": "Watching",
  "game.joinNextGame": "Join next game",
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS (`en` satisfies the `Record<TranslationKey, string>` type).

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat(peer): i18n for presence and spectator states"
```

---

### Task 9: Final verification

**Files:** none

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Build (typecheck)**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual peer session (two/three browsers)**

```bash
npm run dev
```

Checklist:
1. Create a peer table, join from two more tabs, start a game.
2. Close one non-host tab. After ~10s the others show the "Disconnected" badge for that player; if it was their turn, play advances past them.
3. Reopen that tab while the same game is in progress (link/QR):
   - it rejoins, sees its preserved hand, and can take its turns again.
4. Let the remaining players finish, start a new game, then reopen the absent tab mid-game:
   - it shows "Watching" with no play controls; when that game ends and the table is `waiting`, press "Join next game" and confirm it is dealt into the following game.
5. Open `localStorage` in a client: only `sam.playingGame` holds the local player's own metadata; no opponent cards are stored; no table renders before the host snapshot.
6. Have a fourth player open the link for a full table: they get the full-table rejection, and a disconnected member rejoining the same full table is still admitted.

- [ ] **Step 4: Commit (only if lint/build required fixes)**

```bash
git add -u
git commit -m "chore(peer): verification fixes"
```

---

## Self-Review Notes

- Spec coverage: metadata persistence (Tasks 1, 5, 6), presence detection + UI (Tasks 4, 7), reconnect/sync (Tasks 2, 4, 5), same-game resume vs new-game spectate + explicit rejoin (Tasks 2, 3, 7), full-table reject (unchanged `validateJoin`, checked in Task 9).
- Type names are consistent across tasks: `isDisconnected`, `tableId`, `markPlayerDisconnected`, `markPlayerReconnected`, `applyRejoin`, and the `onJoin(player, table, rejoin)` signature.
- No test framework exists; no automated tests are added (per `AGENTS.md`).

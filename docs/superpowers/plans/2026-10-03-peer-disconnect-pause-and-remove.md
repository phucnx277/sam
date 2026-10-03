# Peer Disconnect Pause and Host Removal — Implementation Plan

> **For agentic workers:** Execute autonomously (per AGENTS.md overrides): no
> review gate, work on `main`, commit as you go. REQUIRED: follow the steps in
> order and run `npm run build` + `npm run lint` before claiming done.

**Goal:** Mark disconnected seats immediately, pause (never auto-pass) on a
disconnected current player, let the host remove a disconnected player so the
turn passes, and make mid-game rejoiners spectators until the next game.

**Tech Stack:** React 19, Vite 7, TypeScript, Zustand, PeerJS. No test
framework — verification is `npm run build`, `npm run lint`, and manual checks.

**Spec:** `docs/superpowers/specs/2026-10-03-peer-disconnect-pause-and-remove-design.md`

---

## Task 1: Immediate disconnect in `usePeerData`

**File:** `src/hooks/usePeerData.ts`

1. Remove `PLAYER_AWAY_GRACE_MS`, the `presenceTimers` module state, and the
   `clearPresenceTimer` / `clearPresenceTimers` helpers and their call in
   `clearTimers`.
2. In `startHost`, replace `schedulePlayerPresence` + `dropClientConn` with a
   single immediate `dropClientConn(conn)`:

```ts
const dropClientConn = (conn: DataConnection): void => {
  if (mySession !== session) return;
  const state = get();
  const info = state.clientConns.find((c) => c.conn === conn);
  connLastSeen.delete(conn);
  if (!info) return;
  const remaining = state.clientConns.filter((c) => c.conn !== conn);
  set({ clientConns: remaining });
  const playerId = info.playerId;
  if (!playerId || playerId === state.selfPlayer?.id) return;
  if (remaining.some((c) => c.playerId === playerId)) return;
  const latest = state.latestTable;
  if (!latest || !latest.game.players.some((item) => item.id === playerId)) {
    return;
  }
  const next = markPlayerDisconnected(latest, playerId);
  if (next === latest) return;
  const rev = state.rev + 1;
  set({ latestTable: next, rev });
  broadcastTable(next, rev, playerId);
  state.callbacks?.onUpdate(next, rev);
};
```

3. Heartbeat timeout calls `dropClientConn(conn)` (drop the `0` grace arg).
4. Remove `clearPresenceTimer(...)` calls in the `hello` and `pong` branches.
5. Remove `console.log` remnants if any.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 2: Pure logic — no auto-pass, spectator-only rejoin

**File:** `src/logic/table.ts`

1. `markPlayerDisconnected`: keep only `isDisconnected: true`; delete the
   `inProgress` / `currentPlayerId` / `updateTurnWindow` turn advance and drop
   `findNextActivePlayerId` usage there (still used by `promoteHost`).
2. Remove the now-unused `updateTurnWindow` local helper.
3. `applyRejoin`:
   - `const canResume = table.game.state === "waiting";`
   - `nextAway = !canResume`
   - never adopt cards; `cards: canResume ? gp.cards : []`.
4. Ensure `findNextActivePlayerId` import is still required (it is, for
   `promoteHost`).

**Verify:** `npm run build`, `npm run lint`.

---

## Task 3: `removeDisconnected` action

**Files:** `src/logic/game.ts`, `src/logic/peer.ts`, `src/locales/vi.ts`,
`src/locales/en.ts`

1. Add `"removeDisconnected"` to the `PlayerAction` union in
   `src/type.d.ts`.
2. Add it to `PlayerActionSet` in `src/logic/peer.ts`.
3. Add an `ActionDef` entry in `src/logic/game.ts` (near `removePlayers`):

```ts
removeDisconnected: {
  label: "action.removeDisconnected",
  type: "button",
  checkState(playingTable: Table, currentPlayer: GamePlayer) {
    const visible =
      isGameInProgress(playingTable.game) &&
      playingTable.hostId === currentPlayer.id;
    return { visible, disabled: false };
  },
  handleAction(playingTable: Table, currentPlayer: GamePlayer, data: unknown): Table {
    if (playingTable.hostId !== currentPlayer.id) return playingTable;
    const { removingPlayerId } = data as { removingPlayerId: string };
    const target = playingTable.game.players.find((gp) => gp.id === removingPlayerId);
    if (!target || !target.isDisconnected) return playingTable;
    const game: Game = {
      ...playingTable.game,
      players: playingTable.game.players.map((gp) =>
        gp.id === removingPlayerId
          ? { ...gp, isAway: true, isDisconnected: false, cards: [], selectedCards: [] }
          : gp,
      ),
    };
    if (game.currentPlayerId === removingPlayerId) {
      game.currentPlayerId = findNextActivePlayerId(game, removingPlayerId);
      updateTurnTimes(game);
    }
    return { ...playingTable, game, updatedAt: Date.now() };
  },
},
```

4. Add i18n: vi `"action.removeDisconnected": "Loại khỏi ván"`, en
   `"action.removeDisconnected": "Remove from game"`.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 4: UI guards and host button

**Files:** `src/components/GamePlayer/Actions.tsx`,
`src/components/GamePlayer/PlayerInfo.tsx`

1. `Actions.tsx`: in `handleAutoAction`, after resolving `curPlayer`, return if
   `!curPlayer || curPlayer.isDisconnected`.
2. `PlayerInfo.tsx`: import `useAppData`, `useLocalPlayer`,
   `isGameInProgress`. Compute:
   - `isHost = playingTable.hostId === localPlayer.id`
   - `canRemove = !isMe && isHost && gamePlayer.isDisconnected && isGameInProgress(playingTable.game)`
   Render a small button next to the Disconnected badge:

```tsx
<button
  className="ml-1 text-[0.65rem] px-1 rounded-sm bg-red-500 text-white"
  onClick={() =>
    dispatchAction("removeDisconnected", {
      removingPlayerId: gamePlayer.id,
      actingPlayerId: localPlayer.id,
    })
  }
>
  {t("action.removeDisconnected")}
</button>
```

**Verify:** `npm run build`, `npm run lint`.

---

## Task 5: Final verification

1. `npm run build` — PASS.
2. `npm run lint` — PASS.
3. Manual (peer, 3 browsers): disconnect a non-current player → badge appears
   immediately, game continues; disconnect the current player → game pauses (no
   auto-play), host button appears → removing passes the turn; reconnect →
   spectator "Watching" until the game ends, then "Join next game".

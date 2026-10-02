# Peer-Mode Hand Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-host peer clients never receive other players' cards (in memory, in broadcast, or in `localStorage`), while the host keeps the full authoritative table and failover still works.

**Architecture:** The host stays the only writer. Clients send `action` messages; the host applies them with `ActionDef` and broadcasts a per-recipient masked table. Placeholder cards (`hidden: true`) preserve hand length. A promoted host recovers hidden hands from each client's `hello` carrying its own cards. Peer tables are no longer persisted and no longer listed in the lobby.

**Tech Stack:** React 19, TypeScript, Vite 7, Zustand, PeerJS, Tailwind v4. No test framework — verification is `npm run build` (tsc) + `npm run lint` + manual browser checks.

---

## File Structure

- `src/type.d.ts` — add `Card.hidden`.
- `src/logic/table.ts` — `maskTableFor`.
- `src/logic/game.ts` — `applyAction`; drop `window.confirm` from `tiger`/`resetSession`.
- `src/logic/peer.ts` — `action` message, `hello.cards`/`gameId`.
- `src/hooks/usePeerData.ts` — masked per-connection broadcast, `sendAction`, host action application, hello hand recovery.
- `src/hooks/useAppData.ts` — remove peer-table persistence, `dispatchAction`, host-action Ably persistence.
- `src/components/GamePlayer/Actions.tsx` — dispatch actions.
- `src/components/Tables/PlayingTable.tsx` — `dispatchAction`.
- `src/components/Tables/Tables.tsx` — hide peer list.

---

### Task 1: Pure logic + types

**Files:**
- Modify: `src/type.d.ts`
- Modify: `src/logic/table.ts`
- Modify: `src/logic/game.ts`

- [ ] **Step 1: `Card.hidden`**

In `src/type.d.ts`, add `hidden?: boolean;` to `Card`.

- [ ] **Step 2: `maskTableFor` in `src/logic/table.ts`**

```ts
const hiddenCard = (index: number): Card => ({
  rank: ((index % 13) + 1) as Rank,
  suit: "S",
  hidden: true,
});

export const maskTableFor = (table: Table, viewerId: string): Table => {
  if (table.game.state === "ended") return table;
  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((gp) =>
        gp.id === viewerId
          ? gp
          : {
              ...gp,
              cards: gp.cards.map((_, index) => hiddenCard(index)),
              selectedCards: gp.selectedCards.map((_, index) => hiddenCard(index)),
            },
      ),
    },
  };
};
```

- [ ] **Step 3: `applyAction` in `src/logic/game.ts`**

```ts
export const applyAction = (
  table: Table,
  playerId: string,
  action: PlayerAction,
  data?: unknown,
): Table => {
  const player = table.game.players.find((gp) => gp.id === playerId);
  if (!player) return table;
  const selectedCards =
    (data as { selectedCards?: Card[] } | undefined)?.selectedCards ??
    player.selectedCards;
  return ActionDef[action].handleAction(
    table,
    { ...player, selectedCards },
    data,
  );
};
```

- [ ] **Step 4: Remove native confirms**

In `ActionDef.tiger.handleAction`, delete the `window.confirm(t("confirm.tiger"))`
early return. In `ActionDef.resetSession.handleAction`, delete the
`window.confirm(t("confirm.resetSession"))` early return. Keep `t` import (labels
and `startGame` error).

- [ ] **Step 5: Verify build**

Run: `npm run build`. Expected: PASS (unused `applyAction`/`maskTableFor` is fine).

---

### Task 2: Peer protocol

**Files:**
- Modify: `src/logic/peer.ts`

- [ ] **Step 1: Extend `hello` and add `action`**

```ts
| { type: "hello"; playerId: string; name: string; password: string; cards?: Card[]; gameId?: string }
| { type: "action"; playerId: string; action: PlayerAction; data?: unknown; rev: number; from: string }
```

- [ ] **Step 2: Parse them**

Hello: pass through `cards` when it is an array and `gameId` when a string.
Action: validate `playerId` string, `action` is one of the known `PlayerAction`
values, `rev` finite number; pass `data` through unchanged.

- [ ] **Step 3: Verify build**

Run: `npm run build`. Expected: PASS.

---

### Task 3: Host-authoritative masked transport

**Files:**
- Modify: `src/hooks/usePeerData.ts`

- [ ] **Step 1: Map connections to players**

Change `clientConns: DataConnection[]` to
`clientConns: { conn: DataConnection; playerId: string }[]` and update
`destroyState`, resets, and the `hello` handler accordingly.

- [ ] **Step 2: Add `broadcastTable`**

```ts
const broadcastTable = (table: Table, rev: number, from: string): void => {
  get().clientConns.forEach(({ conn, playerId }) => {
    safeSend(conn, { type: "update", table: maskTableFor(table, playerId), rev, from });
  });
};
```

Use it for the `hello` merge broadcast and the action broadcast. Send the join
`snapshot` masked with `maskTableFor(latest, joining.id)`.

- [ ] **Step 3: Apply host actions**

```ts
const applyHostAction = (playerId: string, action: PlayerAction, data?: unknown): void => {
  const state = get();
  const table = state.latestTable;
  if (!table) return;
  const next = applyAction(table, playerId, action, data);
  if (next === table) return;
  const rev = state.rev + 1;
  set({ latestTable: next, rev });
  broadcastTable(next, rev, playerId);
  state.callbacks?.onUpdate(next, rev);
};
```

Handle `msg.type === "action"` on the host connection: ignore unless the conn's
registered `playerId` matches `msg.playerId`.

- [ ] **Step 4: `sendAction`, host-only `sendUpdate`**

Add `sendAction(action, data)`: host calls `applyHostAction(selfPlayer.id, ...)`;
client sends the `action` message on the open `hostConn`. Make `sendUpdate`
return early unless `role === "host"`, then set `latestTable` and
`broadcastTable(table, rev, "host")`.

- [ ] **Step 5: Hello carries own hand**

In `joinHost` `conn.on("open")`, read the client's own entry from
`get().latestTable` and include `cards` + `gameId` in `hello`.

- [ ] **Step 6: Host adopts shared hand**

In the `hello` handler, after `onJoin`, if `msg.cards?.length && msg.gameId &&
latest.game.id === msg.gameId && latest.game.state !== "ended"`, and the host's
copy for that player is empty or `every(c => c.hidden)`, replace it with the
stripped `{ rank, suit }` cards, increment `rev`, and broadcast.

- [ ] **Step 7: Verify build**

Run: `npm run build`. Expected: PASS.

---

### Task 4: `useAppData` wiring

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Remove peer-table persistence**

Delete `LS_PEER_TABLES`, `getPeerTables`, `savePeerTables`. Purge the stale key
once at module scope. Set initial and `initPeer` `tables: []`. Drop the
`savePeerTables` calls in `setPlayingTable` and `removeTable`.

- [ ] **Step 2: `dispatchAction`**

Add to the store return:

```ts
const DEAL_ACTIONS = new Set<PlayerAction>(["startGame", "newGame", "resetSession"]);

const dispatchAction = useCallback(async (action: PlayerAction, data?: unknown) => {
  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return null;
  const role = usePeerData.getState().role;
  const { playingTable } = useAblyStore.getState();
  if (role && playingTable) {
    if (role === "client" && !DEAL_ACTIONS.has(action)) {
      setPlayingTable(applyAction(playingTable, localPlayer.id, action, data));
    }
    usePeerData.getState().sendAction(action, data);
    return null;
  }
  if (playingTable) {
    return updateTable(applyAction(playingTable, localPlayer.id, action, data));
  }
  return null;
}, [setPlayingTable, updateTable]);
```

Return `dispatchAction` from the hook.

- [ ] **Step 3: Persist host actions in ably mode**

In `bridge.onUpdate`, when `usePeerData.getState().role === "host"`, call
`void persistTableToAbly(table)` before `applyRemoteTable(table)`
(`persistTableToAbly` already no-ops in peer mode).

- [ ] **Step 4: Verify build**

Run: `npm run build`. Expected: PASS.

---

### Task 5: UI dispatch + lobby

**Files:**
- Modify: `src/components/GamePlayer/Actions.tsx`
- Modify: `src/components/Tables/PlayingTable.tsx`
- Modify: `src/components/Tables/Tables.tsx`

- [ ] **Step 1: `Actions` dispatches actions**

Change `onAction` prop to `(action: PlayerAction, data?: unknown) => Promise<void>`.
Replace every `onAction(def.handleAction(...))` with
`onAction(action, { selectedCards })`. Auto-action calls
`onAction(autoAction, { selectedCards: autoCards })`. Add a `resetSession`
confirm in the dispatch path.

- [ ] **Step 2: `PlayingTable`**

Destructure `dispatchAction`; `handleAction(action, data)` calls it.

- [ ] **Step 3: Hide peer lobby list**

`Tables.tsx`: `visible = mode === "peer" ? [] : visibleTables(...)`; render the
"select/no table" header + grid only when `mode !== "peer"`; keep the create
button (in a peer-only row) and the paste/scan controls.

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`. Expected: PASS.

---

### Task 6: End-to-end verification

- [ ] `npm run build && npm run lint`.
- [ ] Three-browser peer session (`Play without Ably`): non-host devtools show
  no `sam.tables`; store/network opponents' cards are `hidden`; own hand real;
  play/pass/tiger/ready work.
- [ ] Peer lobby shows no table list; create/paste/scan still work.
- [ ] Kill host → elect new host → hands recovered, game continues.
- [ ] If a manual check fails, use `systematic-debugging` before changing code.

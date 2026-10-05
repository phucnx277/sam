# Coordinated Table-wide Ably Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When any seated player cannot use PeerJS, switch the entire table to Ably so all devices share one transport, eliminating the host/client split-brain.

**Architecture:** Add a root Ably LiveMap `transports` (`tableId -> "ably"`) on `sam.lobby` as a control channel. Every device in Ably mode subscribes to it. A device whose PeerJS retries are exhausted writes its `tableId`, then every device for that table stops PeerJS, sets `isPeerFallback`, and subscribes to the table's LiveMap for data. The switch is sticky until the table is removed.

**Tech Stack:** React 19, Zustand, Ably LiveObjects 2.12, PeerJS. Verification is `npm run build` (`tsc -b && vite build`) and `npm run lint`. **No test framework exists** — do not add tests.

---

## File structure

- `src/hooks/useAppData.ts` — all behavior changes (control map, subscriptions, switch logic, guards).
- `AGENTS.md` — update the realtime data-model paragraph.

No other files. No new dependencies.

## Current-code anchors

All line numbers refer to the current `src/hooks/useAppData.ts` (602 lines). Read the file before editing. Function declarations are hoisted, so new helpers may be referenced from `bridge`/`initAbly` regardless of position.

---

### Task 1: Add the `transports` control map and its subscription

**Files:** Modify `src/hooks/useAppData.ts`

- [ ] **Step 1: Add the root key**

Change:

```ts
const Keys = {
  Tables: "tables",
};
```

to:

```ts
const Keys = {
  Tables: "tables",
  Transports: "transports",
};
```

- [ ] **Step 2: Add the subscription handle**

Change (lines 65-68):

```ts
let initGeneration = 0;
let lobbySub: Ably.SubscribeResponse | null = null;
let tableSub: Ably.SubscribeResponse | null = null;
let tableSubTableId: string | null = null;
```

to:

```ts
let initGeneration = 0;
let lobbySub: Ably.SubscribeResponse | null = null;
let transportsSub: Ably.SubscribeResponse | null = null;
let tableSub: Ably.SubscribeResponse | null = null;
let tableSubTableId: string | null = null;
```

- [ ] **Step 3: Add `transportsMap` to the store type and initial state**

In the `useAblyStore` type, after:

```ts
  tablesMap: Ably.LiveMap<Ably.LiveMapType> | null;
```

add:

```ts
  transportsMap: Ably.LiveMap<Ably.LiveMapType> | null;
```

In the store initializer, after `tablesMap: null,` add `transportsMap: null,`.

- [ ] **Step 4: Create/populate `transportsMap` in `initAbly`**

Change (lines 118-145):

```ts
      let tablesMap = root.get(Keys.Tables) as Ably.LiveMap<Ably.LiveMapType>;
      if (!tablesMap) {
        tablesMap = await channel.objects.createMap();
        await root.set(Keys.Tables, tablesMap);
      }

      if (generation !== initGeneration) {
        client.close();
        return { error: null };
      }

      const { client: oldClient } = get();
      clearLobbySubscription();
      if (oldClient) {
        oldClient.close();
      }

      set({
        client,
        channel,
        tablesMap,
        tables: parseTables(tablesMap.entries()),
        playingTable: null,
        isPeerFallback: false,
        mode: "ably",
        peerError: null,
      });
      subscribeLobby(tablesMap);
```

to:

```ts
      let tablesMap = root.get(Keys.Tables) as Ably.LiveMap<Ably.LiveMapType>;
      if (!tablesMap) {
        tablesMap = await channel.objects.createMap();
        await root.set(Keys.Tables, tablesMap);
      }
      let transportsMap = root.get(
        Keys.Transports,
      ) as Ably.LiveMap<Ably.LiveMapType>;
      if (!transportsMap) {
        transportsMap = await channel.objects.createMap();
        await root.set(Keys.Transports, transportsMap);
      }

      if (generation !== initGeneration) {
        client.close();
        return { error: null };
      }

      const { client: oldClient } = get();
      clearLobbySubscription();
      clearTransportsSubscription();
      if (oldClient) {
        oldClient.close();
      }

      set({
        client,
        channel,
        tablesMap,
        transportsMap,
        tables: parseTables(tablesMap.entries()),
        playingTable: null,
        isPeerFallback: false,
        mode: "ably",
        peerError: null,
      });
      subscribeLobby(tablesMap);
      subscribeTransports(transportsMap);
```

- [ ] **Step 5: Clear the control subscription when leaving Ably mode**

In `initPeer`, change:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
    storeMode("peer");
    set({
      mode: "peer",
      client: null,
      channel: null,
      tablesMap: null,
```

to:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
    clearTransportsSubscription();
    storeMode("peer");
    set({
      mode: "peer",
      client: null,
      channel: null,
      tablesMap: null,
      transportsMap: null,
```

In `switchToAbly`, change:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
    clearStoredMode();
    set({
      mode: null,
      client: null,
      channel: null,
      tablesMap: null,
```

to:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
    clearTransportsSubscription();
    clearStoredMode();
    set({
      mode: null,
      client: null,
      channel: null,
      tablesMap: null,
      transportsMap: null,
```

- [ ] **Step 6: Add the control-subscription helpers**

Insert immediately after the `subscribeTableFallback` function (after its closing brace, before `async function persistTableToAbly`):

```ts
function clearTransportsSubscription(): void {
  if (transportsSub) {
    transportsSub.unsubscribe();
    transportsSub = null;
  }
}

function subscribeTransports(
  transportsMap: Ably.LiveMap<Ably.LiveMapType>,
): void {
  clearTransportsSubscription();
  transportsSub = transportsMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    for (const tableId of Object.keys(update)) {
      if (transportsMap.get(tableId) === "ably") {
        switchTableToAbly(tableId);
      }
    }
  });
}
```

Do not build yet (Task 2 defines `switchTableToAbly`).

---

### Task 2: Add the switch orchestration helpers

**Files:** Modify `src/hooks/useAppData.ts`

- [ ] **Step 1: Add read/query/mark/switch helpers**

Insert immediately after the `subscribeTransports` function added in Task 1 (still before `async function persistTableToAbly`):

```ts
function readTableFromAbly(tableId: string): Table | null {
  const { tablesMap } = useAblyStore.getState();
  if (!tablesMap) return null;
  const tableMap = tablesMap.get(tableId) as
    | Ably.LiveMap<Ably.LiveMapType>
    | undefined;
  if (!tableMap) return null;
  return parseTable(tableMap.entries());
}

function isTableOnAbly(tableId: string): boolean {
  const { transportsMap } = useAblyStore.getState();
  return transportsMap?.get(tableId) === "ably";
}

function markTableAbly(tableId: string): void {
  const { transportsMap } = useAblyStore.getState();
  if (!transportsMap) return;
  if (transportsMap.get(tableId) === "ably") return;
  void transportsMap.set(tableId, "ably");
}

function switchTableToAbly(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const peer = usePeerData.getState();
  if (state.playingTable?.id !== tableId && peer.tableId !== tableId) return;

  if (!state.isPeerFallback) {
    useAblyStore.setState({ isPeerFallback: true });
  }
  if (peer.role) peer.stop();

  const table = useAblyStore.getState().playingTable;
  const localPlayer = useLocalPlayer.getState().localPlayer;
  const ablyTable = readTableFromAbly(tableId);
  const alreadyMember =
    !!localPlayer &&
    (ablyTable?.game.players.some((p) => p.id === localPlayer.id) ?? false);
  if (table && table.id === tableId && localPlayer && !alreadyMember) {
    void persistTableToAbly(table).then(() => subscribeTableFallback(tableId));
  } else {
    subscribeTableFallback(tableId);
  }
}
```

Note: `switchTableToAbly` calls `peer.stop()` only when a peer session is active, is idempotent, and persists the local table only for a fresh joiner not yet in the Ably copy (established players adopt the Ably state without writing, to avoid clobbering the host's newer snapshot).

---

### Task 3: Wire the triggers and guards

**Files:** Modify `src/hooks/useAppData.ts`

- [ ] **Step 1: `bridge.onFallback`**

Change (lines 358-372):

```ts
  onFallback: (fallback) => {
    if (useAblyStore.getState().mode === "peer") {
      if (fallback) {
        useAblyStore.setState({ peerError: "unreachable" });
      }
      return;
    }
    useAblyStore.setState({ isPeerFallback: fallback });
    const tableId = usePeerData.getState().tableId;
    if (fallback && tableId) {
      subscribeTableFallback(tableId);
    } else {
      clearTableSubscription();
    }
  },
```

to:

```ts
  onFallback: (fallback) => {
    if (useAblyStore.getState().mode === "peer") {
      if (fallback) {
        useAblyStore.setState({ peerError: "unreachable" });
      }
      return;
    }
    const tableId = usePeerData.getState().tableId;
    if (fallback && tableId) {
      markTableAbly(tableId);
      switchTableToAbly(tableId);
    } else if (!fallback) {
      clearTableSubscription();
      useAblyStore.setState({ isPeerFallback: false });
    }
  },
```

- [ ] **Step 2: `reconcilePeerRole` guard**

Change the top of `reconcilePeerRole` (lines 378-379):

```ts
function reconcilePeerRole(table: Table): void {
  if (useAblyStore.getState().mode === "peer") return;
```

to:

```ts
function reconcilePeerRole(table: Table): void {
  if (useAblyStore.getState().mode === "peer") return;
  if (isTableOnAbly(table.id)) return;
```

- [ ] **Step 3: `startPeerSession` guard**

Change (lines 423-435):

```ts
function startPeerSession(
  table: Table,
  player: Player,
  password: string,
): void {
  clearTableSubscription();
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(table.id, player, password, bridge, table);
  }
}
```

to:

```ts
function startPeerSession(
  table: Table,
  player: Player,
  password: string,
): void {
  clearTableSubscription();
  if (isTableOnAbly(table.id)) {
    switchTableToAbly(table.id);
    return;
  }
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(table.id, player, password, bridge, table);
  }
}
```

- [ ] **Step 4: Clear the marker on table removal**

In `removeTable`'s Ably branch, change:

```ts
      try {
        tablesMap!.remove(tableId);
        if (usePeerData.getState().tableId === tableId) {
```

to:

```ts
      try {
        tablesMap!.remove(tableId);
        useAblyStore.getState().transportsMap?.remove(tableId);
        if (usePeerData.getState().tableId === tableId) {
```

- [ ] **Step 5: Build and lint**

Run: `npm run build`
Expected: `tsc -b` and `vite build` succeed.

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat: coordinate table-wide Ably fallback across all players"
```

(The pre-commit hook runs the build, bumps the patch version, runs `npm install`, and `git add -u`; this is expected.)

---

### Task 4: Update AGENTS.md

**Files:** Modify `AGENTS.md`

- [ ] **Step 1: Replace the realtime data-model paragraph**

Find the paragraph in `## Architecture` that begins `Realtime data model:` and currently reads (line-wrapped):

```
  tagged with a host-local `rev`). Ably LiveObjects on channel `sam.lobby` (root
  LiveMap key `tables`) is **write-through plus subscribed fallback**: every
  update is written there; in Ably mode the lobby `tables` map is subscribed for
  live add/remove, and while a PeerJS client is in fallback the active table's
  LiveMap is subscribed for updates (no polling). The lobby/table snapshot is
  read once at load (`parseTables`/`parseTable` in `logic/util.ts`). If a client
  cannot reach the host it subscribes to the table's LiveMap on Ably. Peer
  protocol helpers live in `logic/peer.ts`; the lifecycle store is
  `hooks/usePeerData.ts`.
```

Replace the sentences from "Ably LiveObjects..." through "...table's LiveMap on Ably." with:

```
  tagged with a host-local `rev`). Ably LiveObjects on channel `sam.lobby` (root
  LiveMap keys `tables` and `transports`) is **write-through plus subscribed
  fallback**: every update is written to `tables[tableId]`; the lobby `tables`
  map is subscribed for live add/remove, and the `transports` map is a control
  channel subscribed by every seated device. When any device cannot use PeerJS
  it writes `transports[tableId] = "ably"`; every device on that table then
  switches to Ably (stops PeerJS, sets `isPeerFallback`, subscribes the table's
  LiveMap for data). The switch is sticky until the table is removed. The
  lobby/table snapshot is read once at load (`parseTables`/`parseTable` in
  `logic/util.ts`).
```

Leave the following sentence ("Peer protocol helpers live in `logic/peer.ts`; the lifecycle store is `hooks/usePeerData.ts`.") intact.

- [ ] **Step 2: Commit (docs only)**

```bash
git add AGENTS.md
git commit --no-verify -m "docs: AGENTS.md coordinated table-wide Ably fallback"
```

---

### Task 5: Final verification

**Files:** none

- [ ] **Step 1: Build and lint on the final tree**

Run: `npm run build` — expected success.
Run: `npm run lint` — expected exit 0.

- [ ] **Step 2: Sanity greps**

Run: `grep -n "POLL_INTERVAL_MS\|pollTimer\|startPolling\|stopPolling" src/hooks/useAppData.ts`
Expected: no output.

Run: `grep -n "transportsMap\|switchTableToAbly\|markTableAbly\|subscribeTransports" src/hooks/useAppData.ts`
Expected: the new helpers are present and referenced.

- [ ] **Step 3: Manual verification (two Ably-mode browsers: host A, client B)**

1. Establish PeerJS. Make B unreachable (switch network / block WebRTC). B enters fallback and now A also shows the "Indirect connection" banner.
2. Both read/write through Ably: an action on either side appears on the other.
3. A's PeerJS peer is gone (no `sam-<tableId>` peer) and `transports[tableId]` is `"ably"` in the Ably dashboard.
4. A third browser joining the table while it is on Ably goes straight to Ably (no PeerJS attempt) and is visible to the others.
5. Removing the table clears `transports[tableId]`.

- [ ] **Step 4: Report**

Summarize build/lint output and manual results. Do not claim completion without the command output.

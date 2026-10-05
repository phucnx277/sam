# Restore LiveMap Event Subscriptions in Ably Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Ably mode, keep PeerJS as the primary transport but replace the 3-second Ably polling fallback with LiveMap event subscriptions, and restore live lobby add/remove.

**Architecture:** `src/hooks/useAppData.ts` holds the module-level Ably singleton. Replace the poll timer (`pollTimer` / `startPolling` / `stopPolling` / `refreshTableFromAbly`) with two subscription handles: a permanent lobby `tablesMap.subscribe` (Ably mode only) that upserts/removes changed tables from the update payload, and a per-table `LiveMap.subscribe` that exists only while PeerJS reports `isPeerFallback`.

**Tech Stack:** React 19, Zustand, Ably LiveObjects 2.12 (`LiveMap.subscribe` returns `Ably.SubscribeResponse`), PeerJS. Typecheck/build is `npm run build` (`tsc -b && vite build`); lint is `npm run lint`. **There is no test framework** — do not add tests.

---

## File structure

- `src/hooks/useAppData.ts` — all behavioral changes (subscription state, helpers, call sites).
- `AGENTS.md` — update the realtime data-model paragraph to match the new behavior.

No other files change. No new dependencies.

## Key API facts (ably 2.12)

- `channel.objects.getRoot()` → `Ably.LiveMap<Ably.LiveMapType>`; `.get(id)` returns a nested `LiveMap` or `undefined`.
- `liveMap.subscribe(listener)` → `Ably.SubscribeResponse` with `.unsubscribe()`; listener receives `{ update: { [key]: "updated" | "removed" } }`.
- `LiveMap.subscribe` is an **instance** subscription: it fires for direct key changes on that map, not for mutations of nested child maps. Hence the lobby subscription handles table add/remove, and the per-table subscription handles in-table changes.
- Subscriptions are future-only, so parse + apply once right after subscribing.

---

### Task 1: Replace polling primitives with subscription state and helpers

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Remove the poll interval constant**

In `src/hooks/useAppData.ts`, delete this line (currently line 30):

```ts
const POLL_INTERVAL_MS = 3000;
```

- [ ] **Step 2: Replace the poll timer variable with subscription handles**

Find (currently lines 66-67):

```ts
let pollTimer: number | null = null;
let initGeneration = 0;
```

Replace with:

```ts
let initGeneration = 0;
let lobbySub: Ably.SubscribeResponse | null = null;
let tableSub: Ably.SubscribeResponse | null = null;
let tableSubTableId: string | null = null;
```

- [ ] **Step 3: Replace `stopPolling`, `refreshTableFromAbly`, and `startPolling` with subscription helpers**

Find this whole block (currently lines 229-234 and 377-393):

```ts
function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}
```

and

```ts
async function refreshTableFromAbly(tableId: string): Promise<void> {
  const state = useAblyStore.getState();
  if (!state.tablesMap) return;
  const tableMap = state.tablesMap.get(tableId) as Ably.LiveMap<Ably.LiveMapType>;
  if (!tableMap) return;
  const table = parseTable(tableMap.entries());
  if (!table) return;
  applyRemoteTable(table);
}

function startPolling(tableId: string): void {
  if (useAblyStore.getState().mode === "peer") return;
  stopPolling();
  pollTimer = window.setInterval(() => {
    void refreshTableFromAbly(tableId);
  }, POLL_INTERVAL_MS);
}
```

Replace both (delete the `stopPolling` block; delete `refreshTableFromAbly` and `startPolling`) with:

```ts
function clearLobbySubscription(): void {
  if (lobbySub) {
    lobbySub.unsubscribe();
    lobbySub = null;
  }
}

function clearTableSubscription(): void {
  if (tableSub) {
    tableSub.unsubscribe();
    tableSub = null;
  }
  tableSubTableId = null;
}

function subscribeLobby(tablesMap: Ably.LiveMap<Ably.LiveMapType>): void {
  clearLobbySubscription();
  lobbySub = tablesMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    const changed = Object.keys(update);
    if (changed.length === 0) return;
    useAblyStore.setState((state) => {
      let tables = state.tables;
      for (const id of changed) {
        if (update[id] === "removed") {
          tables = tables.filter((item) => item.id !== id);
          continue;
        }
        const tableMap = tablesMap.get(id) as
          | Ably.LiveMap<Ably.LiveMapType>
          | undefined;
        const parsed = tableMap ? parseTable(tableMap.entries()) : null;
        if (!parsed) continue;
        tables = tables.some((item) => item.id === id)
          ? tables.map((item) => (item.id === id ? parsed : item))
          : [...tables, parsed];
      }
      return tables === state.tables ? {} : { tables };
    });
  });
}

function subscribeTableFallback(tableId: string): void {
  if (useAblyStore.getState().mode === "peer") return;
  clearTableSubscription();
  const { tablesMap } = useAblyStore.getState();
  if (!tablesMap) return;
  const tableMap = tablesMap.get(tableId) as
    | Ably.LiveMap<Ably.LiveMapType>
    | undefined;
  if (!tableMap) return;
  tableSubTableId = tableId;
  tableSub = tableMap.subscribe(() => {
    const table = parseTable(tableMap.entries());
    if (table) applyRemoteTable(table);
  });
  const table = parseTable(tableMap.entries());
  if (table) applyRemoteTable(table);
}
```

Note: `tableSubTableId` is written for clarity/debugging; it is not read elsewhere. Keep it to make the active fallback table explicit.

- [ ] **Step 4: Leave the file uncompilable-but-consistent and move on**

The call sites still reference `stopPolling`; Task 2 and Task 3 fix them. Do not run the build yet.

---

### Task 2: Wire `initAbly` and `onFallback`

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Swap the teardown at the top of `initAbly`**

Find (currently lines 100-101):

```ts
      usePeerData.getState().stop();
      stopPolling();
```

Replace with:

```ts
      usePeerData.getState().stop();
      clearTableSubscription();
```

- [ ] **Step 2: Clear the old lobby subscription when closing the old client**

Find (currently lines 128-142):

```ts
      const { client: oldClient } = get();
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
      storeApiKey(normalizedApiKey);
      storeMode("ably");
```

Replace with:

```ts
      const { client: oldClient } = get();
      if (oldClient) {
        oldClient.close();
      }
      clearLobbySubscription();

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
      storeApiKey(normalizedApiKey);
      storeMode("ably");
```

- [ ] **Step 3: Replace polling with the table subscription in `onFallback`**

Find (currently lines 298-312):

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
      startPolling(tableId);
    } else {
      stopPolling();
    }
  },
```

Replace with:

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

---

### Task 3: Rewire all remaining teardown call sites

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: `initPeer`**

Find in `initPeer` (currently lines 181-182):

```ts
    usePeerData.getState().stop();
    stopPolling();
```

Replace with:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
```

- [ ] **Step 2: `switchToAbly`**

Find in `switchToAbly` (currently lines 201-202):

```ts
    usePeerData.getState().stop();
    stopPolling();
```

Replace with:

```ts
    usePeerData.getState().stop();
    clearTableSubscription();
    clearLobbySubscription();
```

- [ ] **Step 3: `reconcilePeerRole`**

Find (currently lines 327-333):

```ts
  if (table.hostId === localPlayer.id && peer.role !== "host") {
    stopPolling();
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    stopPolling();
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
  }
```

Replace with:

```ts
  if (table.hostId === localPlayer.id && peer.role !== "host") {
    clearTableSubscription();
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    clearTableSubscription();
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
  }
```

- [ ] **Step 4: `startPeerSession`**

Find (currently lines 363-368):

```ts
function startPeerSession(
  table: Table,
  player: Player,
  password: string,
): void {
  stopPolling();
```

Replace with:

```ts
function startPeerSession(
  table: Table,
  player: Player,
  password: string,
): void {
  clearTableSubscription();
```

- [ ] **Step 5: `leaveTable`**

Find in `leaveTable` (currently lines 471-476):

```ts
  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    stopPolling();
    useAblyStore.setState({ isPeerFallback: false });
    unsetPlayingTable();
  }, [unsetPlayingTable]);
```

Replace with:

```ts
  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    clearTableSubscription();
    useAblyStore.setState({ isPeerFallback: false });
    unsetPlayingTable();
  }, [unsetPlayingTable]);
```

- [ ] **Step 6: `removeTable`**

Find the peer-mode branch (currently lines 490-492):

```ts
          usePeerData.getState().stop();
          stopPolling();
          unsetPlayingTable();
```

Replace with:

```ts
          usePeerData.getState().stop();
          clearTableSubscription();
          unsetPlayingTable();
```

Find the Ably branch (currently lines 500-505):

```ts
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          stopPolling();
          useAblyStore.setState({ isPeerFallback: false });
          unsetPlayingTable();
        }
```

Replace with:

```ts
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          clearTableSubscription();
          useAblyStore.setState({ isPeerFallback: false });
          unsetPlayingTable();
        }
```

- [ ] **Step 7: Confirm no polling references remain**

Run:

```bash
grep -rn "stopPolling\|startPolling\|refreshTableFromAbly\|POLL_INTERVAL_MS\|pollTimer" src
```

Expected: no output.

- [ ] **Step 8: Build and lint**

Run: `npm run build`
Expected: `tsc -b` and `vite build` succeed.

Run: `npm run lint`
Expected: exits 0 with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat: use LiveMap subscriptions instead of polling fallback in Ably mode"
```

(The pre-commit hook runs the build and bumps the version; that is expected.)

---

### Task 4: Update AGENTS.md data-model note

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the realtime data-model paragraph**

Find this sentence in the `## Architecture` section:

```
Ably LiveObjects on channel `sam.lobby` (root
  LiveMap key `tables`) is now **write-through fallback only**: every update is
  written there, but nothing subscribes.
```

Replace with:

```
Ably LiveObjects on channel `sam.lobby` (root
  LiveMap key `tables`) is **write-through plus subscribed fallback**: every
  update is written there; in Ably mode the lobby `tables` map is subscribed for
  live add/remove, and while a PeerJS client is in fallback the active table's
  LiveMap is subscribed for updates (no polling).
```

Also find the following sentence:

```
If a client cannot
  reach the host it polls the table from Ably (~3s).
```

Replace with:

```
If a client cannot
  reach the host it subscribes to the table's LiveMap on Ably.
```

- [ ] **Step 2: Commit (docs only)**

```bash
git add AGENTS.md
git commit --no-verify -m "docs: AGENTS.md LiveMap subscription fallback"
```

`--no-verify` skips the build/version-bump hook for a docs-only change.

---

### Task 5: Final verification

**Files:** none

- [ ] **Step 1: Build and lint once more on the final tree**

Run: `npm run build`
Expected: success.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Manual verification (Ably mode, host + client browsers)**

1. Open the app in two browsers, both in Ably mode with the same API key, at the lobby.
2. Create a table in browser A. It appears in browser B's lobby without reload.
3. Delete it in A. It disappears from B without reload.
4. Enter the table in B (host in A). Confirm game updates from A reach B.
5. Force a PeerJS fallback (e.g. block the PeerJS connection or make the host peer unreachable) while seated in B. Confirm A's table updates still reach B and the "fallback" banner in `PlayingTable.tsx` shows (`isPeerFallback`).
6. Restore the peer connection. Confirm `isPeerFallback` clears and updates resume over PeerJS with the table subscription torn down (no duplicate/regressing updates).

- [ ] **Step 3: Report**

Summarize build/lint output and manual results. Do not claim completion without the command output.

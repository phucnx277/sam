# Retry PeerJS on Reset session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the host (or winner) performs **Reset session** on an Ably-fallback table, the table re-attempts PeerJS for everyone; if any device still can't connect, it automatically falls back to Ably again.

**Architecture:** Extend the existing `transports` control map with a `"peer"` value. `retryPeerTransport()` writes `"peer"` and starts the local peer; `subscribeTransports` reacts to `"peer"` on every device; the existing `onFallback` writes `"ably"` again if a device fails. The reset action is the only trigger.

**Tech Stack:** React 19, Zustand, Ably LiveObjects 2.12, PeerJS. Verification: `npm run build` and `npm run lint`. No test framework — do not add tests.

---

## File structure

- `src/hooks/useAppData.ts` — helpers, `"peer"` handling, expose `retryPeerTransport`.
- `src/components/GamePlayer/Actions.tsx` — call `retryPeerTransport()` after a confirmed reset.
- `AGENTS.md` — document the retry and the `"ably" | "peer"` values.

---

### Task 1: Add the PeerJS-retry transport path

**Files:** Modify `src/hooks/useAppData.ts`

- [ ] **Step 1: Handle the `"peer"` value in `subscribeTransports`**

Replace the body of the subscription callback in `subscribeTransports`:

```ts
  transportsSub = transportsMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    for (const tableId of Object.keys(update)) {
      if (transportsMap.get(tableId) === "ably") {
        switchTableToAbly(tableId);
      }
    }
  });
```

with:

```ts
  transportsSub = transportsMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    for (const tableId of Object.keys(update)) {
      const mode = transportsMap.get(tableId);
      if (mode === "ably") {
        switchTableToAbly(tableId);
      } else if (mode === "peer") {
        switchToPeerTransport(tableId);
      }
    }
  });
```

- [ ] **Step 2: Add `switchToPeerTransport` and `retryPeerTransport`**

Insert immediately after the `switchTableToAbly` function:

```ts
function switchToPeerTransport(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const table = state.playingTable;
  if (!table || table.id !== tableId) return;
  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId === tableId && peer.role && !state.isPeerFallback) return;

  clearTableSubscription();
  useAblyStore.setState({ isPeerFallback: false });
  if (table.hostId === localPlayer.id) {
    peer.startHost(table, localPlayer, bridge);
  } else {
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
  }
}

function retryPeerTransport(): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const tableId = state.playingTable?.id ?? usePeerData.getState().tableId;
  if (!tableId || !isTableOnAbly(tableId)) return;
  const { transportsMap } = state;
  if (!transportsMap) return;
  transportsMap.set(tableId, "peer").catch((err) => {
    console.error("[ably] failed to mark table as peer", tableId, err);
  });
  switchToPeerTransport(tableId);
}
```

`switchToPeerTransport` starts the peer directly (not via `startPeerSession`, whose
`isTableOnAbly` guard would bounce back to Ably before the async marker write is
applied locally). The re-entry guard makes the direct call and the later
`transports` echo idempotent.

- [ ] **Step 3: Expose `retryPeerTransport` from the hook**

In the `useAppData` hook's returned object, add `retryPeerTransport,` (next to `leaveTable,`):

```ts
    removeTable,
    leaveTable,
    retryPeerTransport,
    getApiKey,
```

- [ ] **Step 4: Build and lint**

Run: `npm run build` — expected success.
Run: `npm run lint` — expected exit 0.

---

### Task 2: Trigger the retry from Reset session

**Files:** Modify `src/components/GamePlayer/Actions.tsx`

- [ ] **Step 1: Destructure the new method**

Change:

```tsx
    const { playingTable } = useAppData();
```

to:

```tsx
    const { playingTable, retryPeerTransport } = useAppData();
```

- [ ] **Step 2: Call it on a confirmed reset**

In `renderActions`, change:

```tsx
              onAction={() =>
                onAction(def.handleAction(playingTable!, gamePlayer))
              }
```

to:

```tsx
              onAction={() => {
                const next = def.handleAction(playingTable!, gamePlayer);
                void onAction(next);
                if (action === "resetSession" && next !== playingTable) {
                  retryPeerTransport();
                }
              }}
```

`next !== playingTable` detects a cancelled `window.confirm` (the action returns
the same table reference on cancel). `onAction` (i.e. `updateTable`) sets
`playingTable` synchronously before its first `await`, so `retryPeerTransport()`
sees the reset table.

- [ ] **Step 3: Build and lint**

Run: `npm run build` — expected success.
Run: `npm run lint` — expected exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppData.ts src/components/GamePlayer/Actions.tsx
git commit -m "feat: retry PeerJS transport when resetting the session"
```

(The pre-commit hook runs the build, bumps the patch version, runs `npm install`,
and `git add -u`; expected.)

---

### Task 3: Update AGENTS.md

**Files:** Modify `AGENTS.md`

- [ ] **Step 1: Document the retry and values**

In the realtime data-model paragraph, change:

```
switches to Ably (stops PeerJS, sets `isPeerFallback`, subscribes the table's
  LiveMap for data). The switch is sticky until the table is removed.
```

to:

```
switches to Ably (stops PeerJS, sets `isPeerFallback`, subscribes the table's
  LiveMap for data). The switch is sticky until the table is removed, except
  that the `resetSession` action writes `transports[tableId] = "peer"` to retry
  PeerJS for everyone (falling back to Ably again if any device still cannot
  connect). `transports[tableId]` is therefore `"ably"` or `"peer"`.
```

- [ ] **Step 2: Commit (docs only)**

```bash
git add AGENTS.md
git commit --no-verify -m "docs: AGENTS.md reset-session PeerJS retry"
```

---

### Task 4: Final verification

**Files:** none

- [ ] **Step 1: Build and lint**

Run: `npm run build` — expected success.
Run: `npm run lint` — expected exit 0.

- [ ] **Step 2: Manual verification (two Ably-mode browsers, table on Ably)**

1. Perform Reset session. Both devices attempt PeerJS; on success the "Indirect connection" pill (in TableInfo) clears on all devices and gameplay is peer-to-peer.
2. Repeat with one device still unable to use PeerJS (network blocked): the table briefly tries PeerJS, that device falls back and writes `"ably"`, and the whole table returns to Ably (pill reappears everywhere).
3. On a healthy PeerJS table, Reset session does not disturb the transport.

- [ ] **Step 3: Report**

Summarize build/lint output and manual results. Do not claim completion without the command output.

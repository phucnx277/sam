# Retry PeerJS on Reset session — Design

Date: 2026-10-05
Status: Approved for planning

## Goal

The Ably fallback is sticky: once any player falls back, `transports[tableId]`
is `"ably"` and the whole table stays on Ably until the table is removed.
**Reset session** is a natural session boundary — at that point the table should
try PeerJS again, re-establishing the host hub for everyone. The retry is
best-effort: if any device still cannot use PeerJS, it re-signals Ably and the
whole table returns to Ably automatically.

## Decisions

| Decision | Choice |
| --- | --- |
| Trigger | The `resetSession` action only (`newGame` is unaffected) |
| Who initiates | Whoever performs the reset (host, or the winner when the host left) writes the signal; the host re-opens the peer hub |
| Signal | Reuse the `transports` control map with a new value `"peer"` (`tableId -> "peer"`) |
| Failure | Best-effort; a device that cannot connect falls back and writes `"ably"`, returning everyone to Ably |
| No-op cases | If the table is not currently on Ably (marker ≠ `"ably"`), do nothing (don't disturb a healthy peer session) |

## Design

All logic stays in `src/hooks/useAppData.ts`, except the UI trigger in
`src/components/GamePlayer/Actions.tsx`.

### Transport values

`transports[tableId]` becomes a two-value control flag:

- `"ably"` — table is on Ably (written by a falling-back device).
- `"peer"` — request/confirm PeerJS (written on reset).
- absent — default; a freshly created table just attempts PeerJS on entry.

`isTableOnAbly(tableId)` keeps testing only `=== "ably"`.

### New helpers

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
  transportsMap
    .set(tableId, "peer")
    .then(() => switchToPeerTransport(tableId))
    .catch((err) => {
      console.error("[ably] failed to mark table as peer", tableId, err);
    });
}
```

- `switchToPeerTransport` starts the peer directly (it must **not** call
  `startPeerSession`, whose `isTableOnAbly` guard would bounce back to Ably
  before the async marker write is applied locally).
- The re-entry guard (`peer.tableId === tableId && peer.role &&
  !isPeerFallback`) makes the initiator's direct call and the later
  `transports` echo idempotent.

### `subscribeTransports`

Handle both values:

```ts
for (const tableId of Object.keys(update)) {
  const mode = transportsMap.get(tableId);
  if (mode === "ably") {
    switchTableToAbly(tableId);
  } else if (mode === "peer") {
    switchToPeerTransport(tableId);
  }
}
```

If the retry fails on any device, its existing `onFallback(true)` path writes
`"ably"` → every device switches back. No oscillation: `"peer"` is written once
per reset.

### UI trigger

In `Actions.tsx`, `renderActions`' `onAction` for a button action becomes:

```tsx
onAction={() => {
  const next = def.handleAction(playingTable!, gamePlayer);
  void onAction(next);
  if (action === "resetSession" && next !== playingTable) {
    retryPeerTransport();
  }
}}
```

- `next !== playingTable` detects a cancelled `window.confirm` (the action
  returns the same reference on cancel).
- `onAction(next)` runs `updateTable` synchronously up to its first `await`
  (`setPlayingTable`), so `retryPeerTransport` reads the reset table.
- `retryPeerTransport` is taken from `useAppData()` (already destructured in
  `Actions.tsx`) and returned by the hook.

## Races and guard rails

- Only runs when the table is on Ably, so a healthy PeerJS table is untouched.
- `switchToPeerTransport` never touches the `transports` marker directly; only
  `retryPeerTransport` writes `"peer"`, and `onFallback` writes `"ably"`.
- `reconcilePeerRole`/`startPeerSession` guards (`isTableOnAbly`) remain valid
  because the marker is no longer `"ably"` during a retry.
- The host's previous peer was already destroyed when the table switched to
  Ably, so `sam-<tableId>` is free to re-register.

## Out of scope

- Retrying on `newGame` or any other action.
- A manual "retry PeerJS" control.
- Any change to the fallback trigger or the sticky-until-removed rule (reset now
  also clears it, by design).

## Per-file changes

- `src/hooks/useAppData.ts` — `switchToPeerTransport`, `retryPeerTransport`,
  `"peer"` handling in `subscribeTransports`, expose `retryPeerTransport`.
- `src/components/GamePlayer/Actions.tsx` — call `retryPeerTransport()` after a
  confirmed `resetSession`.
- `AGENTS.md` — note that reset session retries PeerJS and `transports` holds
  `"ably" | "peer"`.

## Verification

- `npm run build` (`tsc -b`) and `npm run lint` pass.
- Manual, Ably-fallback table:
  1. With the table on Ably, perform Reset session. Both devices attempt PeerJS;
     on success the "Indirect connection" pill clears for everyone.
  2. Repeat with one device still unable to use PeerJS: the table briefly tries
     PeerJS, that device falls back, and the whole table returns to Ably (pill
     reappears on all devices).
  3. On a healthy PeerJS table, Reset session does not disturb the transport.

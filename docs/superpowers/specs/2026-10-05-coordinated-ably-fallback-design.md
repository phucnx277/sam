# Coordinated table-wide Ably fallback — Design

Date: 2026-10-05
Status: Approved for planning

## Problem

Fallback is currently decided **per device**. In Ably mode with a healthy
PeerJS hub:

- A non-host client that loses connectivity exhausts its PeerJS retries and
  enters fallback (`isPeerFallback`, shown as "Indirect connection"). It then
  subscribes to the table's Ably LiveMap and keeps writing its updates to Ably.
- The host's PeerJS is still healthy, so it never falls back, never subscribes
  to Ably, and never reads the client's Ably writes.

Result: split-brain. The client sees host updates over Ably, but the host never
sees the client's updates. The game must instead switch **the whole table** to
Ably as soon as any seated player cannot use PeerJS.

## Decisions

| Decision | Choice |
| --- | --- |
| Trigger | Any device whose own PeerJS retries are exhausted (enters fallback) signals the table |
| Signal | A dedicated root LiveMap `transports` on `sam.lobby`: `tableId -> "ably"` |
| Who subscribes | Every seated device in Ably mode subscribes to `transports` (small control subscription, separate from game data) |
| On signal | Every device for that table switches to Ably: set `isPeerFallback`, fully stop PeerJS, subscribe to the table's LiveMap for data |
| Reversion | Sticky for the session — once on Ably, stay until the table is left/re-entered or removed. No auto-revert |
| Marker lifecycle | `transports[tableId]` set to `"ably"` by the falling-back device; removed by `removeTable` |
| Data path while on Ably | Unchanged from the existing Ably-only behavior: writes via `persistTableToAbly`, reads via the table LiveMap subscription (`applyRemoteTable`) |
| New dependencies | None |

## Design

All changes stay in `src/hooks/useAppData.ts` except the AGENTS.md note.

### Control map

- Add `Keys.Transports = "transports"`.
- `initAbly` gets/creates the root `transports` LiveMap exactly like `tables`
  and stores it in the zustand store (`transportsMap`).
- `initAbly` subscribes to it after setup; `initPeer`/`switchToAbly` clear the
  subscription when the Ably client is torn down (alongside the existing
  `clearLobbySubscription`).
- Store values as the plain string `"ably"` (a valid `PrimitiveObjectValue`).

### Switching

```ts
function switchTableToAbly(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const peer = usePeerData.getState();
  if (state.playingTable?.id !== tableId && peer.tableId !== tableId) return;

  if (!state.isPeerFallback) {
    useAblyStore.setState({ isPeerFallback: true });
  }
  if (peer.role) peer.stop();

  // A fresh joiner whose local player is not yet in the Ably copy must persist
  // its membership before subscribing, otherwise the immediate apply would drop
  // the join. Established players do not persist (avoids clobbering the host's
  // newer state with a lagging peer snapshot).
  const table = useAblyStore.getState().playingTable;
  const localPlayer = useLocalPlayer.getState().localPlayer;
  const ablyTable = readTableFromAbly(tableId);
  const alreadyMember =
    table &&
    localPlayer &&
    (ablyTable?.game.players.some((p) => p.id === localPlayer.id) ?? false);
  if (table && table.id === tableId && localPlayer && !alreadyMember) {
    void persistTableToAbly(table).then(() => subscribeTableFallback(tableId));
  } else {
    subscribeTableFallback(tableId);
  }
}
```

- `readTableFromAbly(tableId)` is a small helper that reads
  `tablesMap.get(tableId)` and `parseTable(...)` (or returns `null`).
- `markTableAbly(tableId)` writes `"ably"` to `transportsMap` (idempotent),
  best-effort.
- `isTableOnAbly(tableId)` reads `transportsMap?.get(tableId) === "ably"`.

### Triggers and guards

- `bridge.onFallback(fallback)` in Ably mode:
  - `fallback && tableId` → `markTableAbly(tableId)` then
    `switchTableToAbly(tableId)`.
  - `!fallback` → `clearTableSubscription()` + `isPeerFallback: false` (initial
    healthy-open path; after a switch the peer is stopped so this does not
    fire).
- `transports` subscription: for each changed key whose value is `"ably"`,
  call `switchTableToAbly(tableId)` (guarded by mode and by the current table).
- `startPeerSession`: if `isTableOnAbly(table.id)`, call
  `switchTableToAbly(table.id)` and return without starting PeerJS (late
  joiners / reload onto an Ably table).
- `reconcilePeerRole`: return early when `isTableOnAbly(table.id)` so Ably
  data cannot restart a peer session.
- `removeTable`: also `transportsMap?.remove(tableId)` (Ably branch).
- `leaveTable`: unchanged except it already clears the data subscription and
  `isPeerFallback`; the `transports` marker intentionally persists (other
  players remain, table stays on Ably).

### UI

No UI change. `isPeerFallback` keeps driving the existing "Indirect connection"
banner (`PlayingTable.tsx`), which now correctly appears on **all** devices of
the table.

## Races and guard rails

- The `transports` subscription is control-only and never applies game data, so
  it cannot clobber `playingTable` while PeerJS is authoritative.
- `switchTableToAbly` is idempotent: repeat calls (own echo + subscription)
  stop the peer only once (`peer.role` becomes null) and
  `subscribeTableFallback` has its same-table guard.
- Once switched, `peer.stop()` nulls `peer.tableId`/`role`, so `applyRemoteTable`
  (which calls `reconcilePeerRole`) cannot restart PeerJS.
- A marker written concurrently by several devices is last-write-wins to the
  same value `"ably"` — harmless.
- Late joiners read the marker in `startPeerSession`; if it is not yet synced
  they may briefly try PeerJS, then fall back through the normal path and
  re-signal. Acceptable.

## Out of scope

- Resolving divergent game state via merge semantics; Ably remains
  last-write-wins per key, as in the existing Ably-only mode.
- Auto-reverting to PeerJS or a manual retry control.
- Cleaning the marker on `leaveTable`/`resetSession` (sticky by design).

## Per-file changes

- `src/hooks/useAppData.ts` — control map, subscriptions, switch/guards,
  `removeTable` marker cleanup, `readTableFromAbly` helper.
- `AGENTS.md` — document the coordinated table-wide fallback and `transports`
  control map.

## Verification

- `npm run build` (`tsc -b`) and `npm run lint` pass.
- Manual, two Ably-mode browsers (host A, client B):
  1. Establish PeerJS; make B unreachable (e.g. switch B's network / block
     WebRTC). B shows "Indirect connection".
  2. Within a moment A also shows "Indirect connection"; both read/write the
     table through Ably and gameplay actions from either side appear on the
     other.
  3. Confirm A's PeerJS is stopped (no peer id `sam-<tableId>`) and no polling
     timers exist.
  4. A third browser joining the same table while it is on Ably goes straight
     to Ably (no PeerJS attempt) and is visible to the others.
  5. Removing the table clears `transports[tableId]`.

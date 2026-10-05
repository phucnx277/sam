# Restore LiveMap event subscriptions in Ably mode — Design

Date: 2026-10-05
Status: Approved for planning

## Goal

In **Ably mode**, keep PeerJS (host-hub) as the primary real-time transport
between clients, but replace the 3-second polling fallback with Ably LiveMap
**event subscriptions**. Also restore a lobby-level subscription so tables
appear/disappear live instead of only on a one-shot read at `initAbly`.

Nothing subscribes to LiveObjects today: `useAppData.ts` reads the lobby once
(`parseTables(tablesMap.entries())`) and, when PeerJS reports fallback, polls
`refreshTableFromAbly(tableId)` every `POLL_INTERVAL_MS` (3000 ms).

## Decisions

| Decision | Choice |
| --- | --- |
| Lobby subscription | Subscribe to `tablesMap`; use the `update.update` payload keys to upsert/remove only the changed table(s) |
| Playing-table subscription | Subscribe to that table's `LiveMap` only while PeerJS is in fallback; unsubscribe on recovery |
| Initial state on subscribe | One-shot parse + apply immediately after subscribing (subscriptions are future-only) |
| Lobby callback scope | Updates `tables` only — never `playingTable` |
| Polling code | Removed: `POLL_INTERVAL_MS`, `pollTimer`, `stopPolling`, `startPolling`, `refreshTableFromAbly` |
| New dependencies | None |

## Why not restore the old code verbatim

The pre-PeerJS `tablesMap.subscribe` callback replaced `tables` wholesale from
`parseTables(tablesMap.entries())`. With PeerJS now primary, a lobby event
(e.g. another table added) could fire while a locally-applied peer update is
still awaiting its Ably echo, transiently reverting that table's entry. Using
the subscription's update payload lets us touch only the table(s) that actually
changed at the lobby level.

Note (Ably 2.12 semantics, verified in `node_modules/ably/src/plugins/objects`):
`LiveMap.subscribe` is an **instance** subscription — it fires for direct key
changes on that map, not for mutations of nested child `LiveMap`s. So the lobby
subscription reacts to tables being added/removed/replaced, while in-table
detail changes arrive through the per-table subscription (fallback) or PeerJS
(primary). This matches the old behavior.

## Design

Single file, `src/hooks/useAppData.ts`. Module-level handles replace the polling
timer:

```ts
let lobbySub: Ably.SubscribeResponse | null = null;
let tableSub: Ably.SubscribeResponse | null = null;
let tableSubTableId: string | null = null;
```

Helpers:

- `subscribeLobby(tablesMap)` — `tablesMap.subscribe(({ update }) => …)`. Guard
  `mode === "peer"` and skip empty updates. For each changed id:
  - `"removed"` → drop it from `tables`.
  - `"updated"` → read `tablesMap.get(id)`, `parseTable(...)`, and upsert into
    `tables` by id.

  The callback never writes `playingTable`; game state there is owned by
  PeerJS (primary) and the per-table fallback subscription.
- `clearLobbySubscription()` — `unsubscribe()` + null.
- `subscribeTableFallback(tableId)` — no-op outside Ably mode or if the table
  map is absent; otherwise subscribe to `tablesMap.get(tableId)` and, on each
  event, `parseTable` + `applyRemoteTable(table)`. Immediately parse once to
  pick up state from before the subscription.
- `clearTableSubscription()` — `unsubscribe()` + null + clear `tableSubTableId`.

Call-site changes:

- `initAbly`: stop peer; `clearTableSubscription()`; after resolving
  `tablesMap`, close the old client, `clearLobbySubscription()`, `set(... mode:
  "ably")`, then `subscribeLobby(tablesMap)`.
- `onFallback(fallback)`: set `isPeerFallback`; `fallback`
  → `subscribeTableFallback(usePeerData.getState().tableId)`, else
  `clearTableSubscription()`.
- `startPeerSession`, `reconcilePeerRole`, `leaveTable`, `removeTable`:
  `stopPolling()` → `clearTableSubscription()`.
- `initPeer` and `switchToAbly`: `clearTableSubscription()` +
  `clearLobbySubscription()` (client is closed too).

`applyRemoteTable` and `reconcilePeerRole` are unchanged; during fallback
`reconcilePeerRole` is already a no-op because the peer role already matches the
table's `hostId`.

## Races and guard rails

- Lobby subscription never writes `playingTable`, so it cannot regress the
  PeerJS-primary game state.
- Table subscription only exists while `isPeerFallback` is true, so there is no
  competing data source while the peer hub is healthy.
- `applyRemoteTable` already early-returns when the table is neither the
  playing table nor the peer's `tableId`, so a stray fallback event is ignored.
- Subscriptions are per Ably client; closing the client plus explicit
  `clearLobbySubscription()` on re-init prevents duplicate/stale listeners.

## Out of scope

- Live player counts inside lobby cards (would require subscribing to every
  table map; the old code did not do this either).
- Ably connection-state handling, protocol changes, PeerJS behavior.

## Per-file changes

- `src/hooks/useAppData.ts` — swap polling for subscription helpers and rewire
  the call sites above.
- `AGENTS.md` — update the realtime data-model paragraph: Ably LiveObjects is
  now "write-through plus subscribed fallback" instead of "write-through
  fallback only / nothing subscribes".

## Verification

- `npm run build` (`tsc -b`) and `npm run lint` pass.
- Manual, Ably mode, two browsers (host + client):
  - Creating/removing a table in one lobby appears/disappears in the other
    without a reload.
  - With PeerJS forced to fallback, host edits propagate to the client via the
    LiveMap subscription (no 3 s polling cadence) and stop when the peer
    connection recovers.

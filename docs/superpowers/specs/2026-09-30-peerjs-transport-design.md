# PeerJS transport with Ably LiveObjects fallback — Design

Date: 2026-09-30
Status: Approved for planning

## Goal

Move real-time, in-table state synchronization from Ably LiveObjects
subscriptions to a PeerJS host-hub transport. Ably LiveObjects keeps two roles:

1. **Load** — read the lobby/table snapshot once when the app loads or when a
   player enters a table.
2. **Write-through persistence** — every update continues to be written to Ably
   so a reload (or a P2P failure) can recover state.

No Ably `subscribe` calls remain anywhere.

## Decisions

| Decision | Choice |
| --- | --- |
| Topology | Host as hub: host peer id `sam-<tableId>`, clients connect to it |
| Propagation | Optimistic full-table snapshot + host-local monotonic `rev` |
| Authority | Host owns the authoritative in-memory table and broadcasts merged state |
| Ably role | Write-only persistence + one-time load (no subscriptions) |
| Lobby freshness | Load once at `init()`; no refresh (self changes applied optimistically) |
| P2P failure | Client falls back to polling the table from Ably (~3s, read-only) |
| Revisions | Host-local counter, kept **out of** `Table` and the Ably schema |
| Ably writes on update | Every acting client writes its own diff (background, no rollback) |
| Host migration | Manual `transferHost` only; no automatic election |
| New dependency | `peerjs` |
| Verification | `npm run build` (tsc) + `npm run lint` + manual two-browser session |

## Topology

- The host (whoever has `id === Table.hostId`) creates a PeerJS peer whose id is
  deterministic: `sam-<tableId>`.
- A joining player creates a plain `Peer()` (server-assigned random id) and opens
  a `DataConnection` to `sam-<tableId>`.
- All shared state flows `client -> host -> all clients`. The host is the single
  serialization point.
- On host transfer, the old host broadcasts the table carrying the new `hostId`,
  then closes its peer; the newly designated host opens `sam-<tableId>` (retry
  with backoff if the id is briefly taken) and clients reconnect when they see
  the `hostId` change. The new host continues the revision counter from the
  highest `rev` it has observed, so existing clients keep accepting its updates.

## Peer ids and join handshake

- Client opens a DataConnection to `sam-<tableId>` and sends
  `{ type: "hello", playerId, name }`.
- Host replies `{ type: "snapshot", table, rev }` with its authoritative
  in-memory table.
- Client adopts the snapshot (overwriting its possibly-stale Ably copy), then
  applies subsequent updates.

## Message envelope

```ts
type PeerMsg =
  | { type: "hello";    playerId: string; name: string }
  | { type: "snapshot"; table: Table; rev: number }
  | { type: "update";   table: Table; rev: number; from: string };
```

- `rev` is a host-local monotonic counter kept in memory; it is **not** added to
  `Table` nor persisted to Ably, so there is no schema change.
- The host increments `rev` when it applies an update and includes it in the
  broadcast. Clients drop any message whose `rev <= lastRev`.
- Simultaneous actions serialize at the host (last accepted per-rev wins), which
  supersedes the existing `// TODO: handle concurrent updates` comment.

## Update flow (`updateTable`)

1. Apply optimistically locally (unchanged `setPlayingTable` path).
2. If **host**: merge into the authoritative table, `rev++`, broadcast `update`
   to all clients, then write the diff to Ably in the background.
3. If **client**: send `{ update, table, rev: lastRev + 1 }` to the host, and
   write its own diff to Ably in the background (satisfies "continue to send data
   to Ably").
4. Ably write failures are logged, **not** rolled back — peers already hold the
   state. `isUpdatingTable` remains for button disabling.

## `useAppData` changes

- `init()`: attach and `getRoot()` as today, but read `tablesMap.entries()`
  **once** instead of `subscribe()`; populate `tables`.
- `setPlayingTable()`: no `playingTableMap.subscribe()`; instead start the
  PeerJS session (host or client).
- `createTable` / `removeTable` / `enterTable`: keep the same Ably writes.
- Add `refreshTableFromAbly(tableId)` for the fallback poll loop and reloads.
- The public hook API (`useAppData`) and its consumers stay unchanged; P2P is
  wired in internally.

## New module: `src/hooks/usePeerData.ts`

A Zustand store owning the PeerJS lifecycle (not a component effect, so React
StrictMode double-mount cannot create duplicate peers):

- `startHost(table)`, `joinHost(tableId)`, `sendUpdate(table)`, `stop()`.
- State: `peer`, `hostConn`, `clientConns: Map<playerId, conn>`, `rev`,
  `lastRev`, and a `fallback` flag.
- Reconnect with backoff; retry `sam-<tableId>` on "id taken" during transfer.
- Configuration: PeerJS cloud broker by default, overridable via
  `VITE_PEER_HOST` / `VITE_PEER_PORT` / `VITE_PEER_PATH`.

## Fallback when P2P fails

- A client that cannot reach the host starts an Ably poll loop
  (`refreshTableFromAbly` every ~3s, reads only); writes keep going to Ably.
- On a successful (re)connection, polling stops and the host snapshot is adopted.
- `PlayingTable` shows a localized indicator while in fallback mode (new key in
  both `vi` and `en`).

## Lobby behavior

- `tables` is a snapshot taken at `init()` only; tables created/removed by others
  appear after reload.
- Self-created tables are still added optimistically to local state.
- Deep links `?tblId=` work on a fresh load because `init()` reads before
  `enterTableWithLink` runs.

## Error handling & edge cases

| Case | Behavior |
| --- | --- |
| Host closes with no transfer | Clients drop to Ably polling; game stalls until a designated host returns. No auto-election (documented limitation). |
| Duplicate peer id during transfer | Old host closes first; new host retries with backoff. |
| Malformed/oversized message | Validate envelope shape; ignore unknown types. |
| StrictMode double mount | Peer managed by the store, started/stopped explicitly. |
| Late joiner | Host snapshot wins over the stale Ably read. |
| Ably write error | Logged only; no rollback; P2P state stays authoritative. |

## Scope / non-goals

- No live lobby updates.
- No automatic host election.
- No changes to game rules in `logic/game.ts` or to mobile/UI layout beyond the
  fallback indicator.
- No new persisted schema fields (`rev` stays in memory).
- Do not use the bare `@/*` alias (fails `tsc`); use `@logic`, `@hooks`, or
  relative imports.

## Verification

- `npm run build` — `tsc -b` must pass.
- `npm run lint`.
- Manual two-browser session: create/join a table, ready, start, play a turn,
  refresh mid-game (state reloads and P2P resumes), perform a host transfer, and
  kill the host to confirm the Ably-polling fallback.

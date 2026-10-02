# Peer-Mode Host Failover via Unanimous Player Election

## Problem

In peer mode the table host is the single relay: every player's connection
terminates at the peer `sam-<tableId>`, and all table state lives in the host's
memory. If the host closes the app, crashes, or loses network, every other
player is stranded with a frozen table. Today each client retries the host
`MAX_PEER_RETRIES` (4) times and then gives up with `peerError: "unreachable"`.
There is no way to keep playing, and even if the host later returns, the clients
have already fallen into an error state.

## Goal

When the host becomes unreachable, the connected players vote (unanimously) to
promote one of themselves to host. The promoted player takes over the relay and
the table continues. The former host's seat is preserved but their turns are
skipped. If the former host returns, they rejoin as a normal player.

## Non-goals

- Ably-backed coordination or durable server-side state. Peer mode must keep
  working with **no Ably API key** ("play without Ably").
- Perfect partition tolerance / Byzantine consensus. This is best-effort
  failover for an untrusted casual game; `hostEpoch` and the mutually exclusive
  host peer id bound the damage of a split.
- Preserving the old host's sub-second turn timer. Turn state is recomputed by
  the new host on promotion.

## Key constraints

- Topology is a star. When the host is gone, clients cannot coordinate *through*
  the host, so they must be able to reach each other directly.
- Client peer IDs are currently random (`randomClientPeerId`), so no client knows
  how to reach another. They must become deterministic.
- `Table` (and `Game`) are the full authoritative state, broadcast whole on every
  update. A resume is therefore a single fresh snapshot; there is no event log to
  replay.
- All connected clients hold the same last host-assigned `rev`, because state
  only advances through the host.

## Architecture

### Deterministic client peer IDs

Replace `randomClientPeerId()` with:

```
clientPeerId(playerId) = `${CLIENT_PEER_PREFIX}-${playerId}`
```

`playerId` is `pl_xxxxxx` (`generateId`), which is a valid PeerJS id. Because the
table lists every player's id, any participant can compute and connect to any
other participant over the same signaling server. Collisions (the same player id
open in two tabs, or a transient collision while a reloaded peer's socket has not
yet been released) are handled gracefully: `joinHost` retries the deterministic
id once, then falls back to a random-suffixed client id so the duplicate tab can
still connect to the host and play. The canonical tab keeps the deterministic id
and is the one reachable for elections; the suffixed duplicate is not part of the
election mesh.

### New `hostEpoch` term

Add `hostEpoch: number` to `Table`, initialised to `0` in `newTable`. Every
promotion increments it. Epoch is the fencing token:

- Host messages (`snapshot` / `update`) carry the table, so the receiver can read
  `table.hostEpoch` and ignore anything with `epoch < localEpoch`.
- Election messages carry `epoch`; stale-round messages are ignored.
- A promoted host always broadcasts at `epoch = old + 1`, so all clients accept
  it and drop the former host's stale state.

### Away seat (`isAway`)

Add `isAway?: boolean` to `GamePlayer`. On promotion the outgoing host's
`GamePlayer` gets `isAway = true` (cards, chips, and `isReady` are untouched so
the hand is preserved). Turn-rotation helpers treat away players as not present.
On rejoin the flag is cleared and the player resumes their hand.

> Implementation note: turn rotation currently filters on `isReady` alone
> (`findNextPlayerId`, `findNextAutoPlayer`, `isEveryonePassed`,
> `isGameInProgress`). The rotation helpers will be updated to also exclude
> `isAway` players, so `isReady` keeps its "participating" meaning and the away
> flag is the single source of "skip this seat".

## Election protocol

### Host-loss detection

- Each client already schedules host reconnects on `conn.close` / `conn.error` /
  connect timeout.
- Change: retry the host continuously for `HOST_GRACE_MS` (default 10s, replacing
  the 4-attempt give-up). If the host is still unreachable when the grace period
  expires, the client enters **election mode**.
- A client that is the host itself (`role === "host"`) never enters election
  mode.

### Presence handshake

On entering election mode the client:

1. Opens `peer.on("connection")` handling for election frames (clients currently
   do not accept inbound connections; only the host does).
2. Connects to `clientPeerId(otherId)` for every non-away game player except
   itself.
3. Broadcasts `present { playerId, epoch, round }` on every open election
   connection.
4. On receiving `present`, adds the sender to `participants`, replies with its
   own `present` once (so presence is confirmed bidirectionally), then
   re-broadcasts its current `vote` if it has one.

`participants` is the set of players this client has both reached and been
reached by. Election messages from an epoch below the client's current epoch are
ignored.

### Voting

- UI shows a "host is offline — choose a new host" overlay listing candidates:
  every participant (including self) that is not `isAway` and not the outgoing
  host.
- Picking a candidate broadcasts `vote { voterId, candidateId, epoch, round }`
  to all participants and records it locally.
- A client may change its vote before the round closes; the latest vote wins.

### Unanimity

A client promotes candidate `X` when:

- it has received a `vote` from **every** member of its `participants` set, and
- every received vote has the same `candidateId === X`.

With a single participant (all other players unreachable/left), that participant
may self-promote immediately.

If the round exceeds `ELECTION_ROUND_MS` (default 30s) without unanimity, the
round is abandoned: the overlay shows a retry action and a new round
(`round + 1`) begins, keeping the same `epoch`.

### Promotion / host claim

The elected winner:

1. Builds the promoted table via a pure `promoteHost(table, winnerId)` helper
   (logic layer):
   - `hostId = winnerId`
   - `hostEpoch = (hostEpoch ?? 0) + 1`
   - old host `GamePlayer.isAway = true`
   - if `game.currentPlayerId` is now away, advance to the next non-away player
   - `rev` is seeded above the current value
2. Calls `startHost(promotedTable, winner, bridge)` to claim
   `sam-<tableId>`.
3. Broadcasts the standard `snapshot` to every client that reconnects.

If the claim fails with `unavailable-id`, another peer already holds the host id.
The winner retries briefly; if it keeps failing it treats this as "someone else
is host", drops election mode, and reconnects as a client. Because unanimity
made everyone agree on the same winner, a competing claim should only come from
a stale/partitioned host.

When the peer opens, it sends `snapshot { table, rev }` through the existing
host path. Clients that were retrying the host id connect automatically; those
in election mode also stop election and connect to `sam-<tableId>`.

### Turn skipping

When the promoted snapshot is applied, the away host is excluded from rotation.
If it was their turn at the moment of promotion, `promoteHost` advances
`currentPlayerId` past them and resets `turnStartTs`/`turnEndTs`. From then on,
`findNextPlayerId` never selects an away player.

If fewer than two non-away players remain, the game cannot legally continue
(Sam needs at least two). The new host leaves the game paused in its current
state; play resumes when the old host returns or another player joins.

## Old host returns

1. The former host's app reloads (or reconnects). Its local `hostId` still points
   at itself, so `reconcilePeerRole` / `startPeerSession` would try to host. The
   `sam-<tableId>` claim fails with `unavailable-id`.
2. It falls back to client mode, connects to the new host, and receives a
   `snapshot` whose `hostEpoch` is greater than its local epoch.
3. It adopts the new table (new `hostId`, own `isAway` cleared by the host's join
   handling) and can play their preserved hand. It does **not** reclaim host.
4. Host-side join handling: when `onJoin` sees a player already present who is
   `isAway`, it clears `isAway` (and keeps chipCount), then broadcasts an
   `update`. A dedicated `resumePlayer(table, playerId)` helper keeps this pure
   and testable.

## UI

- New overlay `HostElection` shown while `election.active && !playingTable` is
  false — i.e. over the live table while the relay is down.
- Contents: title ("Host disconnected"), candidate buttons, live tally
  ("2/3 voted"), a countdown to `ELECTION_ROUND_MS`, and a retry action when a
  round fails. Existing players/table remain visible behind the overlay.
- Election state is exposed from the peer store through the `useAppData` hook so
  `GamePlayer` can render the overlay.

## i18n

Add keys to `src/locales/vi.ts` (source of truth) and `en.ts`:

```
hostElection.title
hostElection.subtitle
hostElection.choose
hostElection.votedFor
hostElection.votesProgress   // {count}/{total}
hostElection.waiting
hostElection.retry
hostElection.promoted        // {name}
hostElection.failed
```

## Data model changes

- `Table.hostEpoch: number`
- `GamePlayer.isAway?: boolean`
- New peer message types: `present`, `vote` (plus `epoch`/`round` on existing
  messages where useful).
- New pure logic helpers: `promoteHost`, `resumePlayer`, `isPlayerAway`.

## Failure handling / edge cases

- **No unanimity in time**: round fails, overlay offers retry, same epoch.
- **Sole remaining player**: may self-promote (participants size 1).
- **All clients gone**: nothing to elect; the returning host resumes when it
  comes back.
- **Old host returns mid-election**: it is the `isAway` outgoing host and is not
  a candidate. On reaching it, clients can confirm it is alive; if it regains
  the host id before the grace period, election is aborted and normal resume
  proceeds.
- **Two clients both think they won (partition)**: both try `sam-<tableId>`;
  only one claim succeeds. The loser reconnects as a client. Epoch stops the
  stale side's updates from being applied.
- **Away host was the tiger/killer**: the game may be in a state where skipping
  breaks invariants. The new host advances the turn; if the game cannot
  continue it stays paused for host return. (Explicitly de-scoped: full
  re-assignment of tiger/killer roles.)

## Verification

- `npm run build` (`tsc -b && vite build`) must pass — this is the typecheck.
- `npm run lint` must pass.
- Manual, two-browser peer session:
  1. Host + 2 clients join and start a game.
  2. Kill the host tab. After `HOST_GRACE_MS` both clients show the election
     overlay; both vote for client A; A is promoted; both reconnect.
  3. It was the old host's turn: confirm it is skipped and play continues.
  4. Reopen the old host: it joins as a normal player with its preserved hand
     and does not reclaim host.
- No test framework exists; no automated tests are added.

## Rollout

All changes are additive except the client peer id (random → deterministic) and
the host-retry policy. Both affect only peer mode. Ably mode is untouched.

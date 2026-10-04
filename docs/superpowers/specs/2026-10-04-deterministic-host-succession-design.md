# Deterministic Host Succession (no voting)

**Date:** 2026-10-04
**Status:** Approved for implementation (autonomous flow; no review gate)

## Problem

When the host disconnects in peer mode, the remaining clients run a voting
election: a mesh of `present`/`vote` messages with rounds, unanimity, a 30s
window, and a modal. It is complex and error-prone (round desync after a
reload, partial detection, repeated failed rounds). A single host peer id is
already arbitrated by the signaling server, so the vote is unnecessary — all
clients can compute the same successor deterministically from the last shared
table snapshot.

## Behavior

### Successor order

- New pure helper `hostCandidates(table)` in `logic/table.ts` walks
  `table.game.players` in stored (join) order, keeps only players that are not
  `isAway` and not `isRemoved`, and returns them ordered starting immediately
  after the current `hostId`, wrapping around. The old host is excluded.
- Every client derives this list from its last snapshot, so all agree on the
  order without any communication.

### Handoff (staggered cascade)

- On host loss (P2P `close`/`error`, host watchdog timeout, connect timeout, or
  `peer-unavailable`), a previously-connected client (`wasConnected`) calls
  `beginTakeover()`.
- The client computes its `rank` = index of its own id in
  `hostCandidates(latestTable)`.
  - Not in the list (spectator / away / removed): it never claims; it only
    keeps retrying to reach the host peer id.
  - Candidate at rank `r`: it schedules a claim at `r * TAKEOVER_STEP_MS`. At
    its slot, if it is still a client, has no open host connection, and
    `latestTable.hostId` is not itself, it promotes itself via
    `promoteHost(latestTable, self.id)` (bumps `hostEpoch`, marks the old host
    `isDisconnected`) and then `startHost`.
- Only one client can hold the shared host peer id `sam-<tableId>`; the
  signaling server arbitrates. A candidate whose claim loses the id race
  (`unavailable-id` while a takeover claim is pending) immediately reverts to a
  client via `joinHost` instead of retrying, so losers converge quickly.
- The immediate successor (rank 0) claims with no delay. If it is offline it
  never claims, so rank 1 claims after one step, and so on. Each step is
  `TAKEOVER_STEP_MS` (1500ms).

### Removals

- Delete the election state machine: `election` in the peer store,
  `castVote`, `restartElection`, `beginElection`, `evaluateElection`,
  `handleElectionMsg`, election connections/timer/round, and `ELECTION_ROUND_MS`.
- Delete the `present` and `vote` variants from `PeerMsg` and the client-side
  connection handler that consumed them.
- Delete `HostElection.tsx` and its render in `PlayingTable.tsx`; drop the
  `election`/`castVote`/`restartElection` exports from `useAppData`.
- Remove the `hostElection.*` keys from `locales/vi.ts` and `locales/en.ts`.

## Edge cases

- A refreshed/reloaded host cannot reclaim the host id; it rejoins as a plain
  client (unchanged).
- `wasConnected` guard is preserved: a first-time join failure never triggers a
  takeover (clients just retry / fall back to Ably).
- `hostEpoch` continues to gate stale snapshots; `promoteHost` bumps it, so the
  old host's late updates are ignored.

## Files

- `src/logic/table.ts` — add `hostCandidates`.
- `src/logic/peer.ts` — remove `present`/`vote` peer messages.
- `src/hooks/usePeerData.ts` — replace election with `beginTakeover`; remove
  election state/actions and the election connection handler.
- `src/hooks/useAppData.ts` — drop the election/castVote/restartElection
  exports.
- `src/components/Tables/PlayingTable.tsx` — remove `<HostElection />`.
- `src/components/GamePlayer/HostElection.tsx` — delete.
- `src/locales/vi.ts`, `src/locales/en.ts` — remove `hostElection.*`.

## Supersedes

Supersedes the voting election in
`2026-10-03-peer-election-mesh-robustness-design.md` and the election portion of
`2026-10-02-peer-host-failover-design.md`. The `promoteHost`
(detect-and-pause, old host `isDisconnected`) behavior from
`2026-10-03-host-failover-reconnect-design.md` is retained.

## Verification

- `npm run build`, `npm run lint`.
- Manual, 3 browsers: (1) kill the host → the next active seat becomes host,
  the others reconnect, the game continues; (2) kill the host while the
  immediate successor's tab is closed → the next active client claims;
  (3) reload the successor mid-game → its hand is preserved.

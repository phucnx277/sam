# Peer Election Mesh Robustness

**Date:** 2026-10-03
**Status:** Approved for implementation (autonomous flow; no review gate)

## Problem

In a 3-player game, after a failover and the old host rejoins, a second host
disconnect leaves the voting modal showing only the local player as a candidate.

Two defects:

1. **Clients do not detect host loss reliably.** The host heartbeats its
   clients, but clients only detect a dead host via the P2P `close`/`error`
   event, which often does not fire for an abrupt tab close. When only one of
   the two remaining clients notices, it alone enters the election; the other
   ignores its `present` (its election is not active), so the first client's
   `participants` contains only itself and the modal shows one candidate.
2. **Election rounds desync after a reload.** `electionRound` is a module-local
   counter; a reloaded client restarts at 0 while others keep counting, so the
   higher-round client rejects the other's `vote` (`msg.round < el.round`) and
   unanimity can never be reached.

## Behavior

### Client-side host watchdog

- Mirror the host heartbeat: the host already sends `ping` to every client; a
  client now records the time of the last `ping` (and the connection open).
- While connected, the client runs a watchdog; if no `ping` arrives for
  `HEARTBEAT_TIMEOUT_MS` (10s), it treats the host as lost and runs the normal
  drop path (clear hostConn, start the host grace timer, schedule reconnect),
  which leads to `beginElection`. Both remaining clients therefore detect the
  loss and join the election mesh.

### Round convergence

- On receiving a `present`, adopt `round = max(local, incoming)` and reply (and
  re-send a pending vote) with the converged round, so all participants agree on
  the round and votes are no longer rejected after a reload.

## Files

- `src/hooks/usePeerData.ts` — client host watchdog; round convergence in the
  `present` handler.

## Verification

- `npm run build`, `npm run lint`.
- Manual, 3 browsers: after a failover and the old host rejoins, kill the new
  host; both remaining clients must show the election modal with both non-host
  players as candidates, and voting must be able to reach unanimity.

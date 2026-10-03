# Peer Disconnect: Immediate Badge, Paused Turn, and Host Removal

**Date:** 2026-10-03
**Status:** Approved for implementation (autonomous flow; no review gate)

## Problem

In peer mode a player who closes the browser tab is not reliably detected:
the host only learns about drops from the PeerJS `DataConnection` `close`/`error`
event, which does not fire for an abrupt tab close. The presence grace timer
(10s) then marks the seat disconnected and **auto-passes the turn** away from
the disconnected player.

We want explicit, host-controlled recovery instead:

1. Detect drops with the heartbeat fallback (added earlier) plus the
   `close`/`error` event, and mark the seat disconnected **immediately**.
2. Do **not** auto-pass the turn when a seat disconnects. The game pauses while
   it is the disconnected player's turn.
3. The host explicitly removes a disconnected player from the game; the turn
   then passes to the next active player.
4. A reconnecting player who missed part of a game can only watch until that
   game ends, then mark Ready for the next game.

## Behavior

### Disconnect detection (immediate)

- The host keeps the data-channel heartbeat: ping every 4s, a connection with
  no `pong` for 10s is considered dropped.
- On `close`/`error` **or** heartbeat timeout, the host marks the seat
  `isDisconnected: true` immediately. No grace timer, no delayed presence
  window (the `presenceTimers` machinery is removed).
- A drop is only applied when no other live connection exists for the same
  player (so a fast reconnect does not flap).

### Disconnected seat keeps its seat

- `markPlayerDisconnected` sets **only** `isDisconnected: true`. It does **not**
  set `isAway` and does **not** change `currentPlayerId`.
- Because the seat stays `isReady && !isAway`, `findNextActivePlayerId` still
  routes turns to it, so the game pauses every time it reaches that seat.
- The client turn-timeout auto-play must not act on behalf of a disconnected
  current player. Guards are added in `Actions.tsx` so no client auto-plays when
  the current player `isDisconnected`.

### Host removes a disconnected player

- A host-only button is shown on a disconnected seat while a game is in
  progress ("Remove from game").
- Action `removeDisconnected` (host-authoritative):
  - sets the target seat `isAway: true`, `isDisconnected: false`, clears
    `cards`/`selectedCards`,
  - if the target was the current player, advances `currentPlayerId` to
    `findNextActivePlayerId` and resets the turn window.
- The removed player stays in the table as a spectator ("Watching") and can
  mark Ready once the table is `waiting` again.

### Reconnect

- A player who disconnects (including a page refresh) is only flagged
  `isDisconnected`; their seat is otherwise untouched. If the host has **not**
  removed them, a rejoin resumes the same seat: `applyRejoin` clears
  `isDisconnected` and keeps `isAway`/cards as-is, so they can keep playing.
- A player the host **did** remove (`isAway: true`) stays a spectator on rejoin
  and can only mark Ready once the table is `waiting` again.

## Data model

No new fields. Reuses `GamePlayer.isDisconnected` and `GamePlayer.isAway`.
Adds one `PlayerAction`: `"removeDisconnected"` (also to `PlayerActionSet` in
`logic/peer.ts`).

## Files

- `src/hooks/usePeerData.ts` — remove presence timers; mark disconnected
  immediately on drop and heartbeat timeout.
- `src/logic/table.ts` — `markPlayerDisconnected` no longer sets `isAway` or
  advances the turn; `applyRejoin` only clears `isDisconnected` (resume) and
  preserves `isAway` (removed spectators stay spectators).
- `src/logic/game.ts` — add `removeDisconnected` action.
- `src/logic/peer.ts` — register the new action in `PlayerActionSet`.
- `src/components/GamePlayer/Actions.tsx` — skip auto-play for a disconnected
  current player.
- `src/components/GamePlayer/PlayerInfo.tsx` — host-only remove button.
- `src/locales/vi.ts`, `src/locales/en.ts` — `action.removeDisconnected`.

## Edge cases

- Refresh mid-game: the old connection drop briefly flags the seat disconnected,
  then the rejoin clears it and the player resumes their seat and hand.
- Removing a seat excludes it from chip settlement (`calcGameChipCount` filters
  `!isAway`), so no chip bookkeeping is broken.
- If the host removes a non-current disconnected player, the turn is unchanged.
- If `findNextActivePlayerId` finds no active player, it falls back to the
  existing behavior (returns the previous id / first player).
```

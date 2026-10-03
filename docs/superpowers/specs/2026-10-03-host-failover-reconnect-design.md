# Old Host After Failover

**Date:** 2026-10-03
**Status:** Approved for implementation (autonomous flow; no review gate)

## Problem

When the host drops mid-game, clients run a host election. Once a new host is
elected, the old host is marked `isAway` and its turns are skipped, so when it
returns it is stuck as a spectator. It should be treated like a normal player:
the game pauses on its seat, the new host may remove it, and if it is not
removed it resumes playing on rejoin.

Note: the host cannot rejoin until a new host is elected — the clients do not
accept it back mid-election — so there is no "host returns during the election"
scenario to handle.

## Behavior

### New host elected — old host is a normal seat

- `promoteHost` no longer marks the old host `isAway`. It marks the old host
  `isDisconnected: true` and leaves the seat otherwise intact (cards, chips,
  `isReady`). The game pauses on that seat until it returns or is removed.
- The new host sees the usual "Disconnected" badge plus the host-only "Remove
  from game" button on the old host's seat.

### Removal vs. resumable away

- Add `GamePlayer.isRemoved?: boolean`.
- `removeDisconnected` sets `isRemoved: true`, `isAway: true`,
  `isDisconnected: false`, and clears `cards`/`selectedCards`.
- `applyRejoin` clears `isDisconnected` and sets
  `isAway = !!gp.isRemoved`. Therefore:
  - a player the host never removed (including the old host) resumes their seat
    and hand;
  - a removed player stays a spectator ("Watching") until the table is `waiting`
    again, then marks Ready for the next game.

## Data model

- `GamePlayer.isRemoved?: boolean` (new).

## Files

- `src/type.d.ts` — add `isRemoved`.
- `src/logic/table.ts` — `promoteHost` marks the old host disconnected;
  `applyRejoin` is `isRemoved`-aware.
- `src/logic/game.ts` — `removeDisconnected` sets `isRemoved`.

## Supersedes

This changes the old-host behavior from
`docs/superpowers/specs/2026-10-02-peer-host-failover-design.md` ("promotion
sets the old host `isAway`, turns skipped"). The old host is now paused on and
skipped only after explicit removal, matching the disconnect-pause-and-remove
model.

## Verification

- `npm run build`, `npm run lint`.
- Manual, 3 browsers: (1) host drops, new host elected, old host returns and was
  not removed → resumes with its hand; (2) same but the new host removes the old
  host → old host is "Watching" and cannot resume.

# Host Reconnection During/After Failover

**Date:** 2026-10-03
**Status:** Approved for implementation (autonomous flow; no review gate)

## Problem

When the host drops mid-game, clients run a host election. Two gaps:

1. If the original host reconnects while the election is still open, the voting
   overlay should be dismissed and players told the host is back. Today the
   overlay closes via `endElection`, but there is no notification.
2. After a new host is elected, the old host is marked `isAway` and its turns are
   skipped, so when it returns it is stuck as a spectator. It should be treated
   like a normal player: the game pauses on its seat, the new host may remove it,
   and if it is not removed it resumes playing on rejoin.

## Behavior

### Original host returns while an election is open

- When a client in an active election reconnects to the host, abort the
  election (`endElection`), which closes the `HostElection` voting overlay and
  all election connections.
- Surface a transient in-app banner (`hostElection.hostReturned`) that
  auto-dismisses after ~6s.
- If the host returns during the pre-election grace window, no election was open
  and no banner is shown.
- A snapshot from a **different** host id must not trigger this banner (guard on
  the election's recorded host id).

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
- `PeerDataState.notice: TranslationKey | null` + `clearNotice` (new), exposed
  through `useAppData`.

## Files

- `src/type.d.ts` — add `isRemoved`.
- `src/logic/table.ts` — `promoteHost` marks the old host disconnected;
  `applyRejoin` is `isRemoved`-aware.
- `src/logic/game.ts` — `removeDisconnected` sets `isRemoved`.
- `src/hooks/usePeerData.ts` — notice state/auto-dismiss; abort-and-notify on
  host reconnect during an election.
- `src/hooks/useAppData.ts` — expose `notice` / `clearNotice`.
- `src/components/Tables/PlayingTable.tsx` — render the notice banner.
- `src/locales/vi.ts`, `src/locales/en.ts` — `hostElection.hostReturned`.

## Supersedes

This changes the old-host behavior from
`docs/superpowers/specs/2026-10-02-peer-host-failover-design.md` ("promotion
sets the old host `isAway`, turns skipped"). The old host is now paused on and
skipped only after explicit removal, matching the disconnect-pause-and-remove
model.

## Verification

- `npm run build`, `npm run lint`.
- Manual, 3 browsers: (1) host drops, election open, host returns before a
  winner → overlay closes + banner, game continues; (2) host drops, new host
  elected, old host returns and was not removed → resumes with its hand; (3)
  same but the new host removes the old host → old host is "Watching" and cannot
  resume.

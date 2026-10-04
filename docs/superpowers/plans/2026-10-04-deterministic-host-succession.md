# Deterministic Host Succession — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-04-deterministic-host-succession-design.md`

## Task 1 — Pure successor ordering

**Files:** `src/logic/table.ts`

- Add exported `hostCandidates(table: Table): string[]`:
  - `active = table.game.players.filter((gp) => !gp.isAway && !gp.isRemoved)`
  - find index of `table.hostId` in `active`; return active ids rotated to start
    after it (`[...active.slice(i+1), ...active.slice(0, i)]`). If the host is
    not in `active` (away/removed/absent), return all active ids in order.

**Verify:** `npm run build` compiles; function is pure (no imports needed).

## Task 2 — Replace election with takeover in the peer store

**Files:** `src/hooks/usePeerData.ts`

- Remove election constants/state: `ELECTION_ROUND_MS`, `electionRound`,
  `electionTimer`, `electionConns`, `HostElectionState`, `election`,
  `castVote`, `restartElection`, `beginElection`, `evaluateElection`,
  `handleElectionMsg`, `endElection`.
- Add `TAKEOVER_STEP_MS = 1500` and `HOST_GRACE_MS = 3000`; module-level
  `takeoverTimer`, `takeoverClaim`, and `takeoverBaseTable`; clear
  `takeoverTimer` in `clearTimers`.
- Add `beginTakeover()`:
  - guards: `wasConnected`, `role === "client"`, no pending `takeoverTimer`,
    have `latestTable`/`selfPlayer`/`callbacks`.
  - `rank = hostCandidates(latestTable).indexOf(self.id)`; return if `-1`.
  - schedule claim at `HOST_GRACE_MS + rank * TAKEOVER_STEP_MS` with a captured
    `mySession`; inside, re-check session/role, no open `hostConn`,
    `latestTable.hostId !== self.id`; then `set({ latestTable: promoted })`,
    `startHost(promoted, me, cb)`, then `takeoverClaim = true` and
    `takeoverBaseTable = t`, then `cb.onSnapshot(promoted, get().rev)`.
- Replace every `startHostElection()` call (connect timeout, `onDrop`,
  `peer-unavailable`) with `beginTakeover()`; delete `startHostElection`.
- Clear the pending takeover on a successful host connection open
  (where `endElection()` was called).
- Add `revertTakeover()` in `startHost`: clears the claim/base and, if
  `takeoverBaseTable` was set, restores `latestTable` to it before
  `joinHost(...)`. Call it on every host-peer error while a takeover claim is
  pending (both `unavailable-id` and generic errors); keep the existing
  retry-then-join behavior for non-takeover `unavailable-id`.
- Reset `takeoverClaim`/`takeoverBaseTable` at `startHost` entry and on
  `startHost` peer open, `joinHost`, and `stop`.
- Remove the client-side `peer.on("connection")` election handler in
  `joinHost` (no longer used) and the `handleElectionMsg` call in `joinHost`.

**Verify:** `npm run build`, `npm run lint`.

## Task 3 — Remove election surfaces

**Files:** `src/logic/peer.ts`, `src/hooks/useAppData.ts`,
`src/components/Tables/PlayingTable.tsx`,
`src/components/GamePlayer/HostElection.tsx` (delete),
`src/locales/vi.ts`, `src/locales/en.ts`

- `peer.ts`: delete the `present` and `vote` members of `PeerMsg` and their
  `parsePeerMsg` cases.
- `useAppData.ts`: delete the `election`, `castVote`, `restartElection`
  selectors and return entries.
- `PlayingTable.tsx`: remove the `HostElection` import and `<HostElection />`.
- Delete `HostElection.tsx`.
- Remove the 7 `hostElection.*` keys from both locale files.

**Verify:** `npm run build`, `npm run lint`.

## Task 4 — Final verification

- `npm run build` — passes (this is the typecheck).
- `npm run lint` — passes.
- `rg "election|castVote|restartElection|HostElection" src` — no matches.

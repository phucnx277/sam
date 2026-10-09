# Persist joined peer tables for non-host players

Date: 2026-10-09
Status: approved (autonomous flow)

## Problem

In peer mode, the table list on the lobby is rendered from the persisted
`sam.tables` localStorage entry (see `Tables.tsx`: `visible = mode === "peer" ?
tables : ...`). `setPlayingTable` (`useAppData.ts`) only upserts a peer table
into `tables` (and calls `savePeerTables`) when the local player **hosts** it:

```ts
const isHosted = state.mode !== "peer" || data.hostId === localPlayer?.id;
```

A non-host player who joins a table therefore gets `playingTable` set but the
table is never written to `sam.tables`. When they press back (🔙 in
`GamePlayer.tsx`), `backToLobby` removes `tblId`/`tblPw` from the URL and
reloads. After reload the mode is still peer but `tables` is read from
`getPeerTables()`, so the table the player just left is **missing from the
list** and they cannot rejoin it.

## Decisions (from brainstorming)

- Persist the peer table whenever the **local player is a member** (host or a
  listed, non-removed player), matching the Ably-mode membership rule
  (`visibleTables` → `isTableMember`).
- Keep the table in the stored list after backing out, so it can be rejoined
  from the lobby.
- Scope is peer mode only. Ably mode already persists tables through the live
  lobby map and filters them by membership.

## Approaches considered

- **A (chosen). Change the `setPlayingTable` membership predicate in
  `useAppData.ts`.** Replace the peer host-only check with `isTableMember`.
  Because `setPlayingTable` is the single funnel for both `enterTable` and
  incoming peer snapshots, every join/update path persists the table with no
  extra call sites, and snapshot updates keep the stored copy fresh.
- B. Persist explicitly at the join call sites (`enterTable`,
  `bridge.onSnapshot`). More scattered; easy to miss a path and diverge from
  the update funnel. Rejected.
- C. Store joined tables under a separate `sam.joinedTables` key and merge into
  the list. Extra state, duplicate keys, and merge/cleanup logic for no
  behavioral gain. Rejected.

## Design

### `src/hooks/useAppData.ts`

In `setPlayingTable`:

- Import `isTableMember` from `@logic/table`.
- Replace:

  ```ts
  const isHosted =
    state.mode !== "peer" || data.hostId === localPlayer?.id;
  if (!isHosted) {
    return { playingTable: data };
  }
  ```

  with a membership check:

  ```ts
  const isMember =
    state.mode !== "peer" || isTableMember(data, localPlayer);
  if (!isMember) {
    return { playingTable: data };
  }
  ```

- The existing upsert into `tables` and the trailing
  `if (get().mode === "peer") savePeerTables(get().tables);` are unchanged, so
  member tables (host or joined) are persisted and kept in sync on every
  snapshot.

`isTableMember(table, player)` is `table.hostId === player.id ||
table.players.some((p) => p.id === player.id && !p.isRemoved)`. It uses the
table-level `players` array, which the peer snapshot includes for the joining
player. A player who has been removed (`isRemoved`) is not treated as a member,
so a stale snapshot without them is not re-persisted.

### Non-goals

- No automatic removal of a persisted table when the host closes it or the
  player is removed. Manual removal via the `×` control (host/admin only) and
  `removeTable` are unchanged. A non-host's stored copy may go stale, which
  matches how a host's own stored tables already behave.
- No change to `removeTable`, the URL/rejoin logic in `Tables.tsx`, or the peer
  transport.

## Verification

- `npm run build` passes (`tsc -b && vite build`).
- `npm run lint` passes.
- Manual (two peer clients): non-host joins a table, presses back — the table
  is listed in the lobby and can be re-entered. A player who is not a member of
  a table it merely observed never has that table persisted.

# Ably lobby: show only your tables — Design

Date: 2026-10-02
Status: Approved for planning

## Goal

In **Ably mode**, the lobby table list must show a user only the tables they
created or joined. An **admin** user continues to see every table.

Today `initAbly` loads *all* tables from the shared Ably LiveMap into the
`tables` store (`src/hooks/useAppData.ts:137`), so every client with the key sees
every table. Peer mode already behaves the way we want: it lists only tables in
`sam.tables` (ones this device hosted), so this change targets Ably mode only.

## Decisions

| Decision | Choice |
| --- | --- |
| Filtering | Pure selector applied at render; the `tables` store keeps all tables |
| Membership | `hostId === player.id` OR an active entry in `players` (`isRemoved !== true`) |
| Admin | `localPlayer.isAdmin` → see all tables |
| Removed / left players | Table hidden from their lobby; they can still rejoin via link |
| Invite links / QR | Unchanged: deep links still resolve the table by id and join |
| Scope | Ably mode; peer mode unchanged (already member-only) |
| New dependencies | None |
| Verification | `npm run build` (tsc) + `npm run lint` + manual two-user session |

## Membership & selector

Add to `src/logic/table.ts` (framework-free, alongside `validateJoin`):

```ts
export const isTableMember = (table: Table, player: Player): boolean =>
  table.hostId === player.id ||
  table.players.some((p) => p.id === player.id && !p.isRemoved);

export const visibleTables = (
  tables: Table[],
  player: Player | null,
): Table[] =>
  !player || player.isAdmin
    ? tables
    : tables.filter((table) => isTableMember(table, player));
```

- `hostId` is also present in `players` for a freshly created table; the explicit
  host check makes the host visible even if the players entry is ever missing or
  marked removed.
- `isRemoved` is optional on `TablePlayer`; only `=== true` means removed, so a
  table without the flag counts as active.
- A `null` player (not yet initialized) returns all tables (defensive; renders
  rarely hit this because the lobby requires a player).

## UI wiring

`src/components/Tables/Tables.tsx` derives the visible list from the store and
uses it everywhere the lobby renders or counts tables:

```ts
const visible = visibleTables(tables, localPlayer);
```

- `t(visible.length > 0 ? "lobby.selectTable" : "lobby.noTable")` (currently
  `Tables.tsx:215`).
- Create-button condition `visible.length < TABLE_LIMIT` (`Tables.tsx:217`).
- The rendered list `visible.map(...)` (`Tables.tsx:228`).

The deep-link effects (`Tables.tsx:152-160` and `applyLink`'s `getTables().find`,
`Tables.tsx:100`) keep reading the **unfiltered** store/`getTables()`, so a link
or QR to a table the user is not in still resolves and opens `EnterTable`.

`src/components/Tables/NewTable.tsx` uses the visible count for its own
`TABLE_LIMIT` guard (`NewTable.tsx:63`) instead of raw `tables.length`:

```ts
if (visibleTables(tables, localPlayer).length >= props.limit) { ... }
```

`EnterTable` and the peer join path are untouched.

## Why render-time filtering

- The `tables` store is populated once at `initAbly` and there are no Ably
  subscriptions; it is a snapshot anyway, so holding every table in memory is
  already the status quo.
- Keeping all tables in state means deep-link/QR resolution (which looks up a
  table by id in `getTables()`) needs no rework and never regresses.
- `setPlayingTable` already adds/updates the played table in `tables`
  (`useAppData.ts:154-171`), so a user who joins a previously hidden table
  becomes an active member and it appears in their lobby immediately.
- Filtering is UI-only. It is **not** a security boundary: the Ably key is shared
  and any client can read the whole store. It matches peer mode's existing
  privacy level.

## Edge cases

| Case | Behavior |
| --- | --- |
| New user, no tables | Sees `lobby.noTable` and the create button |
| Host | Visible via `hostId` |
| Active player | Visible via `players` entry with `isRemoved !== true` |
| Removed / left player | Hidden; can rejoin via shared link and becomes visible on entry |
| Invite link / QR to a hidden table | Still resolves by id and opens `EnterTable` |
| Admin | Sees every table; create limit uses the full count |
| Peer mode | Unchanged; `visibleTables` is a no-op on already member-only tables |
| Non-admin at `TABLE_LIMIT` tables | Create button hidden and `NewTable` guard blocks creation |

## Per-file changes

- `src/logic/table.ts` — add `isTableMember`, `visibleTables`.
- `src/components/Tables/Tables.tsx` — derive and use `visible` for the list and
  counts; leave deep-link/`getTables()` paths filtered-free.
- `src/components/Tables/NewTable.tsx` — use `visibleTables(...).length` for the
  limit guard.

## Scope / non-goals

- No change to the Ably LiveMap contents, writes, subscriptions, or polling.
- No server-side enforcement (there is no backend).
- No change to peer-mode table listing or `sam.tables`.
- No `Table`/`Player` schema changes and no new dependencies.
- No new i18n keys.
- Do not use the bare `@/*` alias (fails `tsc`); use `@logic`, `@hooks`, or
  relative imports.

## Verification

- `npm run build` — `tsc -b` must pass.
- `npm run lint`.
- Manual session with two players sharing an Ably key: create tables from both;
  each non-admin sees only their own; an admin sees all; an invite link to a
  hidden table still enters it and the table then appears in that player's lobby;
  remove a player and confirm the table disappears from their lobby while the
  link still works.

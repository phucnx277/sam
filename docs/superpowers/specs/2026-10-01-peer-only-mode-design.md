# Peer-only (no-Ably) mode — Design

Date: 2026-10-01
Status: Approved for planning

## Goal

Let a user play Sam **without any Ably API key**. The app runs in one of two
transport modes:

- **ably** — today's behavior: a shared Ably LiveObjects lobby, PeerJS for
  in-table sync, Ably as write-through persistence and polling fallback.
- **peer** — PeerJS only. No Ably client is ever constructed. A device creates a
  table locally and shares it by QR/link; others join by connecting to the host's
  PeerJS peer id `sam-<tableId>`.

The primary motivation is removing the per-player Ably key requirement for
ad-hoc tables: the host creates a table, shows a QR, and everyone else joins with
just the link.

## Decisions

| Decision | Choice |
| --- | --- |
| Mode selection | Explicit choice at setup; persisted as `sam.mode = "ably" \| "peer"` |
| Network model | "Offline-like" = no Ably key needed; PeerJS cloud signaling (internet) is fine, overridable via `VITE_PEER_*` |
| Join validation | Extend the PeerJS handshake: `hello` carries the password, host replies `snapshot` or `reject(reason)` |
| Cross-mode links | The link's mode wins: it switches the device's transport mode and persists it |
| Peer-hosted table persistence | `sam.tables` (localStorage); host tables survive reload and re-host |
| Peer-mode table list | Only tables this device hosts; remote snapshots update `playingTable` only |
| P2P failure in peer mode | Surface an error; **never** fall back to Ably polling |
| New dependencies | None |
| Verification | `npm run build` (tsc) + `npm run lint` + manual two-device session |

## Mode model & state

New persisted keys:

- `sam.mode`: `"ably" | "peer"` (absent = not yet chosen).
- `sam.tables`: JSON `Table[]` of peer-mode hosted tables.

`useAppData` store additions:

```ts
type TransportMode = "ably" | "peer";

// state
mode: TransportMode | null;          // rehydrated from sam.mode
tables: Table[];                     // peer mode: from sam.tables; ably: from tablesMap
peerError: JoinRejectReason | "unreachable" | null;

// actions
initAbly: (key: string) => Promise<{ error: Error | null }>; // today's init(), persists sam.mode="ably"
initPeer: () => void;                // sets mode "peer", loads sam.tables, clears Ably state
switchToAbly: () => void;            // clears sam.mode, resets store so the key screen shows
joinPeerTable: (tableId: string, password: string) => void;
clearPeerError: () => void;
```

- `isInitialized` becomes `mode === "peer" || !!tablesMap`.
- The store initializes `mode` from `sam.mode` and, when `mode === "peer"`,
  `tables` from `sam.tables`, so a returning peer user lands straight in the
  lobby with no key prompt.
- `initPeer()` and `switchToAbly()` both call `usePeerData.stop()` and
  `stopPolling()` first. `switchToAbly()` leaves `sam.tables` intact so toggling
  back does not lose hosted tables.

## Setup UI

`InitAppData` keeps the Ably key input and Next button, and gains a secondary
button `t("credentials.playWithoutAbly")` that calls `initPeer()`.

URL handling on mount:

- `?mode=peer` → `initPeer()`; strip `mode` from the URL (like `apiKey`).
- `?apiKey=…` → existing Ably flow; `initAbly` persists `sam.mode = "ably"`.

A peer-mode lobby shows a small `t("lobby.connectWithAbly")` button that calls
`switchToAbly()`.

## Create, share, join

### Create (peer mode)

`createTable` skips `channel.objects.createMap` / `tablesMap.set`. It builds the
table with `newTable(params)`, adds it to `tables`, persists `sam.tables`,
`setPlayingTable(table)`, then `startPeerSession` (host, since
`hostId === player.id`). Ably mode is unchanged.

### Share

`ShareTable` builds the join URL per mode:

- peer: `${origin}?mode=peer&tblId=<id>&tblPw=<pw>`
- ably: `${origin}?apiKey=<encoded>&tblId=<id>&tblPw=<pw>` (unchanged)

A shared helper `parseTableLink(url)` in `logic/util.ts` returns
`{ mode, tableId, password, apiKey }`, inferring `ably` when an `apiKey` is
present and `peer` when `mode=peer`; it returns `null` when neither is present or
`tblId` is missing (callers treat that as an invalid link).

### Join

Link handling in `Tables` (`handlePasteLink`, `handleScan`, and the mount
effect) branches on `mode`:

- **peer link** — if the device is not already in peer mode, call `initPeer()`
  (switch + persist). Then, if `tblId` is in local `tables` (host re-open),
  use the existing `EnterTable`/`enterTable` path; otherwise call
  `joinPeerTable(tableId, password)`.
- **ably link** — if the device is in peer mode, call `initAbly(apiKey)`, then the
  existing `enterTableWithLink` flow.

`joinPeerTable` starts a client peer directly from `tableId` (no local table).
The joining device knows only `tblId` + `tblPw`; `playingTable` is set when the
host's `snapshot` arrives. If the link carries no `tblPw`, `EnterTable` is shown
in a peer variant (it takes an optional `tableId` instead of a `table`) and calls
`joinPeerTable` on submit.

The existing URL effect in `Tables` (keyed on `playingTable`) writes `tblId` to
the URL on entry, so a client reload while in peer mode auto-rejoins through the
mount effect.

## Peer protocol changes

`logic/peer.ts`:

```ts
export type PeerMsg =
  | { type: "hello";    playerId: string; name: string; password: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update";   table: Table; rev: number; from: string }
  | { type: "reject";   reason: JoinRejectReason };
```

- `parsePeerMsg` requires `reason` to be a string on `reject`, and defaults a
  missing `hello.password` to `""` for tolerance.
- `JoinRejectReason` (`"password" | "full"`) and `validateJoin(table, player,
  password)` live in `logic/table.ts`. `validateJoin` encapsulates the existing
  `enterTable` checks (password when the player is not the host, and player
  limit); `enterTable` is refactored to call it so the two never drift.

### Host

In `usePeerData.startHost`'s `hello` branch, before adding the player:

```ts
const latest = get().latestTable ?? table;
const reason = validateJoin(latest, joining, msg.password);
if (reason) {
  safeSend(conn, { type: "reject", reason });
  conn.close();
  return;
}
// existing addTablePlayer + broadcast + snapshot
```

### Client

`usePeerData.joinHost` signature changes to:

```ts
joinHost: (tableId: string, player: Player, password: string,
            cb: PeerCallbacks, baseTable?: Table) => void;
```

It opens the connection to `tablePeerId(tableId)`, sends
`{ type: "hello", playerId, name, password }`, and on `reject` clears timers,
destroys the peer, and invokes a new callback `cb.onReject(reason)`.
`PeerCallbacks` gains `onReject: (reason: JoinRejectReason) => void`.

## `useAppData` wiring

- `persistTableToAbly` returns early when `mode === "peer"`.
- `startPolling` / `bridge.onFallback`: in peer mode a `true` fallback sets
  `peerError = "unreachable"` and never starts polling. Ably mode is unchanged.
- `bridge.onSnapshot`: in peer mode, `setPlayingTable(table)` (this is the moment
  a joined client enters); Ably mode keeps `applyRemoteTable`.
- `applyRemoteTable` in peer mode updates `playingTable` if it matches and, when
  the local role is host, persists the host snapshot to `sam.tables`; it never
  appends foreign tables to `tables`.
- `reconcilePeerRole` is a no-op in peer mode (host is fixed; no Ably-driven host
  transfer).
- `updateTable` in peer mode: `sendUpdate` + persist host snapshot; skips
  `persistTableToAbly`.
- `removeTable` in peer mode: remove from `tables`, persist `sam.tables`, stop
  the peer and unset `playingTable` if it was active. No Ably.
- `leaveTable` is unchanged except it is already Ably-free; hosted tables stay in
  `sam.tables` so the host can re-open them.
- New helper `savePeerTables(tables)` / `getPeerTables()` under `sam.tables`.

## Error surfacing

`bridge.onReject(reason)` sets `peerError`. `Lobby` renders `peerError` through
the existing `AutoFadeout` overlay with a translated message and clears it after
a short delay:

| reason | i18n key |
| --- | --- |
| `password` | `error.passwordIncorrect` |
| `full` | `error.peerFull` |
| `unreachable` | `error.peerUnreachable` |

## Per-file changes

- `src/logic/table.ts` — `JoinRejectReason`, `validateJoin`, `enterTable` refactor.
- `src/logic/peer.ts` — `hello.password`, `reject` message, parser updates.
- `src/logic/util.ts` — `parseTableLink` helper.
- `src/hooks/usePeerData.ts` — `joinHost` signature + password, `onReject`,
  reject handling.
- `src/hooks/useAppData.ts` — mode/`peerError` state, `initAbly`/`initPeer`/
  `switchToAbly`/`joinPeerTable`/`clearPeerError`, mode guards, `sam.tables`
  persistence, `sam.mode` persistence.
- `src/components/Credentials/InitAppData.tsx` — peer button + `?mode=peer`.
- `src/components/Tables/Tables.tsx` — mode-aware link handling, auto-rejoin,
  Connect-with-Ably button, error overlay.
- `src/components/Tables/ShareTable.tsx` — peer join URL.
- `src/components/Tables/EnterTable.tsx` — optional peer (`tableId`) variant.
- `src/components/Tables/TableInfo.tsx` — hide the Ably key row when the mode is
  `peer`.
- `src/components/Lobby/Lobby.tsx` — render `peerError`.
- `src/locales/vi.ts`, `src/locales/en.ts` — new keys (vi is key source of truth).

## Edge cases

| Case | Behavior |
| --- | --- |
| Client reload (peer) | `sam.mode` = peer and URL `tblId`/`tblPw` → auto `joinPeerTable` |
| Host reload (peer) | Hosted table in `sam.tables`, URL `tblId` → `enterTable` host path re-hosts |
| Ably-mode device scans peer QR | `initPeer()` switches + persists, then joins |
| Peer-mode device opens Ably link | `initAbly(key)` switches + persists, then enters |
| PeerJS host unreachable | Retries, then `peerError = "unreachable"`; no Ably polling |
| Wrong password / table full | Host `reject`; client shows translated error and returns to lobby |
| Host disconnects mid-game (peer) | Clients retry; no host failover (documented limitation) |
| Older client without `hello.password` | Treated as `""`; rejected only if the table has a password |
| Password transport | Sent over the DTLS-encrypted DataConnection; the QR already carries the plaintext password, so no new exposure |
| StrictMode double mount | Peer lifecycle stays in the Zustand store, unchanged |

## Scope / non-goals

- No changes to Ably subscriptions or the Ably lobby protocol.
- No automatic host failover/election in peer mode.
- No changes to game rules in `logic/game.ts`.
- No new `Table` schema fields.
- No backend/server; no new dependencies.
- Do not use the bare `@/*` alias (fails `tsc`); use `@logic`, `@hooks`, or
  relative imports.

## Verification

- `npm run build` — `tsc -b` must pass.
- `npm run lint`.
- Manual two-device session: host in peer mode creates a table and shares the QR;
  a client scans and enters (wrong password is rejected, correct password enters);
  play a turn; refresh the host and the client and confirm both rejoin; open a
  peer link on an Ably-mode device and confirm the mode switch; point PeerJS at an
  unreachable server and confirm the error instead of an Ably poll.

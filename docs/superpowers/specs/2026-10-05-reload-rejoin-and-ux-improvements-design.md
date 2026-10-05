# Reload rejoin + lobby/table UX improvements — design

Date: 2026-10-05

## Problem

Four related UI/UX issues in the multiplayer flow:

1. **Reload drops the player back to the lobby.** While sitting at a table, the
   page URL carries `tblId` (and `tblPw` in peer mode), but `playingTable` is
   not persisted. On reload the app does not resume the table, returning the
   player to the lobby. Affects both Ably and PeerJS transports.
2. **No feedback while joining from a pasted link / scanned QR.** `applyLink`
   does async work (Ably key init, PeerJS connect) before anything visible
   happens, so the app appears frozen.
3. **The Share modal is hard to find right after creating a table.** The host
   lands on the waiting table and must open Table info to share.
4. **Share lives in the wrong place.** The Share button is inside the Table info
   modal; it should be a first-class action next to the info button.

## Goals

- Reloading on a table URL resumes that table without returning to the lobby,
  in both transports, when the local player is already a member.
- Non-members and password-protected tables keep the existing password-prompt
  flow on reload.
- Pasting a link / scanning a QR shows a blocking loading indicator until the
  join resolves.
- Creating a table immediately opens the Share modal over the waiting table.
- The Share action is a button directly below the info (ℹ️) button; Table info
  no longer contains a Share button.

## Non-goals

- Persisting `playingTable` itself to `localStorage` (the URL is the source of
  rejoin intent).
- Changing the share link format.
- Changing the password-prompt UI.

## Design

### 1. Reload rejoin (both transports)

**Root cause.** `Tables` has two independent effects:

- the mode-specific deep-link resolver (`parseTableLink` for Ably, direct
  `tblId`/`tblPw` read for peer), and
- the URL-sync effect that deletes `tblId` from the URL whenever
  `playingTable` is `null`.

On reload the URL-sync effect runs while the deep-link resolver is still
waiting (Ably table list not yet loaded, or `parseTableLink` returns `null`
because the URL no longer has `apiKey` after first init). It strips `tblId`
before the resolver can act, so rejoin never happens. For Ably the resolver
additionally fails because `parseTableLink` only classifies a link as Ably
when `apiKey` is present.

**Approach.** Capture the rejoin intent once, at first render, in a ref that is
read before any effect runs. Use it to gate URL cleanup until the rejoin
resolves.

- Add `rejoinIntentRef` initialised during render from
  `new URL(window.location.href)`:
  `{ tableId: string; password: string | null } | null`.
- Replace `autoLinkedRef` with `rejoinHandledRef`.
- Single rejoin effect (deps `[mode, tables, localPlayer]`):
  - Peer mode: find the table in `getTables()` (host's persisted tables). If
    found, open `EnterTable` with it. Otherwise, if `password !== null`, call
    `joinPeerTable(tableId, password)` and keep the loading overlay until the
    snapshot/error arrives. Otherwise open `EnterTable` in `tableId` mode to
    prompt for the password.
  - Ably mode: wait until `tables` contains `tableId`, then open `EnterTable`
    with that table. `EnterTable` already auto-enters when the local player is
    already a member (`alreadyJoined`) or the table has no password, and shows
    the password form otherwise.
  - Guard with `rejoinHandledRef` so it runs once.
- Gate the URL-sync effect: while an intent exists and has not been handled,
  do nothing (leave `tblId`/`tblPw` in place). Once handled, the existing logic
  applies.
- Graceful give-up: if the intent is still unhandled after the store is
  initialised and a short grace period (`~4s`) elapses with the table still
  absent, mark it handled and let the URL-sync effect clean up, so a deleted
  table cannot pin a stale `tblId` forever.

Reload stays in the correct transport because `sam.mode` is already persisted
and `isInitialized` is true for peer mode, so `InitAppData` does not run and
cannot switch a peer session to Ably.

### 2. Loading indicator while pasting / scanning

- Add `lobby.connecting` to the dictionaries (`Connecting…` /
  `Đang kết nối…`).
- Add an `isJoining` state to `Tables`.
- `handlePasteLink` and `handleScan` set `isJoining` before calling
  `applyLink`, and clear it on failure (invalid link alert). On success the
  overlay is cleared by effects when a modal opens (`enteringTable` /
  `enteringPeerTableId`), when `playingTable` becomes non-null (peer snapshot),
  or when `peerError` is set.
- Render a full-screen fixed overlay (blurred backdrop, centered spinner with
  `animate-spin` and the localized text) at the `Tables` root so it also covers
  the playing-table view during a reload rejoin.
- The peer `joinPeerTable` path keeps the overlay up until the connection
  resolves, giving feedback the previous flow lacked.

### 3. Auto-open Share after creating a table

- `createTable` returns `{ error, table }` instead of `{ error }`.
- `NewTable` gains an optional `onCreated?: (table: Table) => void`, invoked
  after a successful create, before `close()`.
- `Tables` passes `onCreated={setSharingTable}` and renders
  `{sharingTable && <ShareTable table={sharingTable} onClose={…} />}` at the
  root, so it appears over the freshly entered waiting table.

### 4. Move Share out of Table info

- `TableInfo`: remove the `ShareTable` import, `isSharing` state, the header
  Share button, and the `isSharing` render block.
- `GamePlayer`: add a `📤` button directly below the ℹ️ button (inside the
  existing `isMe` action column), opening `ShareTable` with `playingTable`. Use
  `t("table.share")` as its `title`/accessible label.

## Components touched

- `src/components/Tables/Tables.tsx` — rejoin intent/ref, rejoin effect, URL
  gating, `isJoining` overlay, `setSharingTable`.
- `src/components/Tables/NewTable.tsx` — `onCreated` callback.
- `src/hooks/useAppData.ts` — `createTable` returns the created table.
- `src/components/Tables/TableInfo.tsx` — remove Share.
- `src/components/GamePlayer/GamePlayer.tsx` — add Share button.
- `src/locales/vi.ts`, `src/locales/en.ts` — add `lobby.connecting`.

## Error handling

- Invalid pasted/scanned link: clear overlay, alert `table.linkInvalid` (as
  today).
- Peer unreachable / rejected: overlay clears on `peerError`; the existing
  `Lobby` error toast is shown.
- Ably key rejected during paste: `alert(error.message)` and clear overlay.
- Table deleted before a reload rejoin resolves: grace-period give-up drops the
  intent; player remains in the lobby.

## Testing

No test framework exists. Verification is manual plus the build/typecheck and
lint:

- `npm run build` (`tsc -b && vite build`) and `npm run lint` must pass.
- Manual: create a table in each transport, reload, confirm rejoin; paste a
  link and scan a QR, confirm the overlay; create a table, confirm the Share
  modal opens; confirm Share is below ℹ️ and gone from Table info.

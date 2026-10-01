# Switch to PeerJS mode from the Ably lobby — Design

Date: 2026-10-01
Status: Approved for planning

## Goal

Give an Ably-mode user a lobby control to switch the device into **peer** mode
without needing an Ably API key or a peer link. It mirrors the existing
peer→Ably control (`lobby.connectWithAbly` → `switchToAbly()`), completing the
transport toggle in both directions from the lobby.

## Decisions

| Decision | Choice |
| --- | --- |
| Trigger | A text link in the Ably lobby, styled/placed like the existing Connect-with-Ably link |
| Action | Call the existing `initPeer()` directly (close Ably, load `sam.tables`, persist `sam.mode = "peer"`) |
| Confirmation | None — no dialog |
| Label (en) | `Switch to PeerJS` |
| Label (vi) | `Chuyển sang PeerJS` |
| New dependencies | None |

## UI

In `src/components/Tables/Tables.tsx`, inside the `!playingTable` lobby block,
immediately after the existing `mode === "peer"` block:

```tsx
{mode === "ably" && (
  <div className="mt-2 text-center">
    <button
      type="button"
      className="text-sm text-cyan-600 underline"
      onClick={initPeer}
    >
      {t("lobby.switchToPeer")}
    </button>
  </div>
)}
```

`initPeer` is already destructured from `useAppData()` in `Tables.tsx`, so no
new imports or hooks are required. The button is symmetric with the existing
peer→Ably link (`Tables.tsx` lines 260–270): same container, classes, and
position.

## Behavior

Clicking the button invokes `initPeer()` (`src/hooks/useAppData.ts:175`), which:

- increments `initGeneration` and closes the current Ably `client` if present;
- stops `usePeerData` and any Ably polling timer;
- persists `sam.mode = "peer"`;
- resets store state to `mode: "peer"`, `client/channel/tablesMap: null`,
  `tables: getPeerTables()` (from `sam.tables`), `playingTable: null`,
  `isPeerFallback: false`, `peerError: null`.

The user lands in the peer lobby showing this device's previously hosted peer
tables. No API key is required.

## Scope and edge cases

- **Separate table stores.** The Ably lobby's tables are not carried into peer
  mode; peer mode shows only `sam.tables`. Switching back via the existing
  Connect-with-Ably link (`switchToAbly()`) resets to the credentials screen with
  the stored API key prefilled.
- **Lobby only.** The button renders inside the `!playingTable` block, so it is
  never shown during a game.
- **Direction guard.** Rendered only when `mode === "ably"`, so it cannot appear
  in peer mode or on the credentials screen (`mode === null`).
- **No layout regression.** Uses the same wrapper markup as the existing
  transport link, so lobby spacing is unchanged.

## Per-file changes

- `src/components/Tables/Tables.tsx` — add the `mode === "ably"` link block.
- `src/locales/vi.ts` — add `lobby.switchToPeer: "Chuyển sang PeerJS"`.
- `src/locales/en.ts` — add `lobby.switchToPeer: "Switch to PeerJS"`.

No changes to `useAppData`, `usePeerData`, `logic/*`, or the Ably protocol.

## Verification

- `npm run build` — `tsc -b` must pass.
- `npm run lint`.
- Manual: open the app in Ably mode, click Switch to PeerJS, confirm the peer
  lobby appears with the Connect-with-Ably link; click it and confirm the
  credentials screen returns with the key prefilled. Reload after switching and
  confirm the app stays in peer mode.

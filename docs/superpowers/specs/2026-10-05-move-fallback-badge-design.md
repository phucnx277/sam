# Move the "Indirect connection" badge into TableInfo — Design

Date: 2026-10-05
Status: Approved for planning

## Goal

Now that the Ably fallback is **table-wide** (a table is either on PeerJS or on
Ably for everyone), the amber "Indirect connection" badge no longer represents a
per-device connection state. Move it off the always-on game overlay in
`PlayingTable` and into `TableInfo`, which the local player opens via the ℹ️
button.

## Decisions

| Decision | Choice |
| --- | --- |
| Source | Removed from `PlayingTable.tsx` (both the badge block and the `isPeerFallback` destructure) |
| Destination | `TableInfo.tsx`, rendered under the table-name header row |
| Condition | Render only while `isPeerFallback` is true |
| Label | Existing key `game.fallbackMode` (en "Indirect connection", vi "Kết nối gián tiếp") |
| Styling | Same amber pill classes as before (`px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900`), left-aligned via `self-start` in the modal's column flex |
| New dependencies | None |

## Changes

### `src/components/Tables/PlayingTable.tsx`

- Remove `isPeerFallback` from the `useAppData()` destructure.
- Delete the fixed top-left badge block:

```tsx
{isPeerFallback && (
  <div className="fixed top-2 left-2 z-20 px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900">
    {t("game.fallbackMode")}
  </div>
)}
```

`t` remains used elsewhere in the component.

### `src/components/Tables/TableInfo.tsx`

- Destructure `isPeerFallback` from `useAppData()`.
- Immediately after the header row (`<div className="flex items-center
  justify-between gap-x-2">…</div>`), render:

```tsx
{isPeerFallback && (
  <div className="self-start px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900">
    {t("game.fallbackMode")}
  </div>
)}
```

The modal body is a `flex flex-col`, so `self-start` keeps the pill left-aligned
and full-width siblings unaffected.

## Out of scope

- Any change to fallback logic, the `transports` control map, or when
  `isPeerFallback` is set.
- Renaming the translation key or its text.

## Verification

- `npm run build` (`tsc -b`) and `npm run lint` pass.
- Manual: on a table that has switched to Ably, opening the info modal (ℹ️)
  shows the amber "Indirect connection" pill; the in-game overlay no longer
  shows it; a healthy PeerJS table shows no pill.

# Plan: Long-press to lock/unlock card sorting

Spec: `docs/superpowers/specs/2026-10-07-long-press-lock-cards-design.md`

## Task 1: Add the `useLongPress` hook

File: `src/hooks/useLongPress.ts` (new)

Implement the pointer-event based hook per the spec: 1000ms default delay,
10px move tolerance, `handlers`, `isHolding`, and `consumeLongPress()`.
Clean up the timer on unmount.

## Task 2: Add the progress-ring CSS

File: `src/index.css`

Append the `@keyframes hold-ring` and `.hold-ring` rules from the spec.

## Task 3: Replace the checkbox with the lock indicator

File: `src/components/GamePlayer/PlayerInfo.tsx`

- Drop `reorderDisabled` + `onCardReorderingChange` props; add `locked` and
  `isHolding`.
- Replace the checkbox button with the lock/unlock emoji + conditional SVG
  progress ring (markup in the spec).

## Task 4: Wire the gesture in `GamePlayer.tsx`

File: `src/components/GamePlayer/GamePlayer.tsx`

- Rename `reoderDisabled` -> `sortingLocked` everywhere.
- Use `useLongPress` to toggle `sortingLocked` on a 1s hold.
- Spread the hook `handlers` on the hand container alongside `swipeHandlers`.
- Add `onContextMenu` preventDefault, `onClickCapture` that consumes a
  long-press to swallow the click, and the `select-none`
  `[-webkit-touch-callout:none]` classes.
- Pass `locked={sortingLocked}` and `isHolding` to `PlayerInfo`.

## Task 5: Update locales

Files: `src/locales/vi.ts`, `src/locales/en.ts`

- Remove `game.cardsSorted`.
- Add `game.cardsLocked`, `game.cardsUnlocked`.
- Update `howToPlay.gestures.reorder2`.
- Add `howToPlay.gestures.lock`, `howToPlay.gestures.lock1`.

## Task 6: Add the how-to-play section

File: `src/components/GamePlayer/HowToPlay.tsx`

Insert the lock gesture section after the reorder section.

## Task 7: Verify and commit

1. `npm run build` (type-checks en/vi parity via `satisfies`).
2. `npm run lint`.
3. Confirm `game.cardsSorted` has no source references.
4. Commit spec + plan + code. Pre-commit hook runs the build and bumps the
   patch version, as usual.

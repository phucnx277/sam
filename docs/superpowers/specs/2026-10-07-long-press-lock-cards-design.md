# Long-press to lock/unlock card sorting

Date: 2026-10-07
Status: approved (autonomous flow)

## Problem

In `PlayerInfo.tsx` there is a "Cards sorted" checkbox next to the player's
name. It toggles `reorderDisabled` in `GamePlayer.tsx`, which simultaneously:

- enables/disables drag-reordering of the hand (`Cards` / `OneCard`), and
- enables/disables swipe-sorting (`sortLocalCards` returns early when locked).

The checkbox is small, easy to miss, and sits in a row that also holds the
player name and chip count. We want a more natural, gesture-based control:
**press and hold your own hand for 1 second to lock/unlock sorting**.

## Decision

Replace the checkbox with a **long-press gesture on the local hand** plus a
**state indicator**:

1. Remove the "Cards sorted" checkbox (`PlayerInfo`).
2. Show a lock/unlock emoji in the same slot: 🔒 when locked, 🔓 when unlocked.
3. While the hand is held, show a **progress ring** around the emoji that fills
   over 1 second; on completion, toggle the lock.
4. Suppress the browser's default long-press / right-click behavior on the hand
   (context menu, text selection, iOS callout, image drag).

The lock keeps its current meaning: **locked = drag-reorder disabled AND swipe
sort disabled; unlocked = both enabled**. The existing auto-reset by game phase
stays:

- entering `handChecking` -> unlocked,
- entering `playing` -> locked,
- long-press toggles the lock within the current phase.

## Approaches considered

- **A (chosen).** A small reusable `useLongPress` hook built on pointer events,
  wired in `GamePlayer`; `PlayerInfo` only renders the indicator. Pointer
  events give unified mouse/touch/pen handling and clean cancellation on
  move/cancel.
- B. Inline `setTimeout` bookkeeping inside `GamePlayer`. Works, but mixes
  gesture logic with rendering and is harder to read/maintain.
- C. Raw `touchstart`/`mousedown` listeners. More code, worse device parity,
  duplicates what pointer events already unify.

## Design

### `useLongPress` hook (new: `src/hooks/useLongPress.ts`)

Framework-level React hook (like `useDimensions`/`useCountDown`), not a
Zustand store.

Signature:

```ts
useLongPress({
  delay?: number,        // default 1000ms (ring / lock duration)
  pressDelay?: number,   // default 200ms (debounce before engaging)
  moveTolerance?: number,// default 10px
  onLongPress: () => void,
}): {
  isHolding: boolean,
  handlers: {
    onPointerDown, onPointerMove, onPointerUp,
    onPointerLeave, onPointerCancel,
  },
  consumeLongPress: () => boolean,
}
```

Behavior:

- `onPointerDown` (primary button / touch / pen) records the origin and starts
  the **debounce** timer (`pressDelay`). The hold is not engaged yet, so a tap
  (e.g. selecting a card) never flashes the progress ring.
- After `pressDelay` of steady pressure, `isHolding` becomes `true` and the
  ring/lock timer (`delay`) starts.
- Any movement beyond `moveTolerance` cancels the hold (so swipes still work).
- `pointerup` / `pointerleave` / `pointercancel` cancel the hold.
- When the timer fires, it calls `onLongPress()`, records that a long press
  happened, and clears the hold.
- `consumeLongPress()` returns and resets the "long press just fired" flag so
  `GamePlayer` can suppress the synthetic `click` that follows a release.

### `GamePlayer.tsx`

- Rename the local state `reoderDisabled` -> `sortingLocked` (behavior
  unchanged; clearer name). Keep the phase-based reset effect.
- `sortLocalCards` early-returns while `sortingLocked`.
- Wire the hook:

  ```ts
  const { isHolding, handlers, consumeLongPress } = useLongPress({
    onLongPress: () => setSortingLocked((prev) => !prev),
  });
  ```

- Attach `handlers` to the hand container (the same element that already gets
  `swipeHandlers`), only when it is the local player and cards exist.
- Add `onContextMenu={e => e.preventDefault()}` on the hand container.
- Add `onClickCapture` that calls `consumeLongPress()` and, if true,
  `stopPropagation()` + `preventDefault()` to swallow the post-hold click.
- Add `select-none` and `[-webkit-touch-callout:none]` classes to the hand
  container.
- Pass `locked={sortingLocked}` and `isHolding={isHolding}` to `PlayerInfo`.

### `PlayerInfo.tsx`

- Remove the checkbox button, `reorderDisabled`, and `onCardReorderingChange`
  props; add `locked: boolean` and `isHolding: boolean`.
- Render, in the former checkbox slot:

  ```tsx
  <span className="relative inline-flex size-6 items-center justify-center select-none"
        title={locked ? t("game.cardsLocked") : t("game.cardsUnlocked")}
        aria-label={...} role="img">
    {isHolding && (
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="14" fill="none" stroke="#bae6fd" strokeWidth="2" />
        <circle className="hold-ring" cx="15" cy="15" r="14" fill="none"
                stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )}
    <span className="leading-none">{locked ? "🔒" : "🔓"}</span>
  </span>
  ```

### CSS (`src/index.css`)

```css
@keyframes hold-ring {
  from { stroke-dashoffset: 87.96; }
  to   { stroke-dashoffset: 0; }
}
.hold-ring {
  stroke-dasharray: 87.96; /* 2 * PI * r, r = 14 */
  stroke-dashoffset: 87.96;
  animation: hold-ring 1s linear forwards;
}
```

### i18n (`src/locales/vi.ts`, `src/locales/en.ts`)

- Remove `game.cardsSorted`.
- Add:
  - `game.cardsLocked`: vi "Bài đã khóa" / en "Cards locked"
  - `game.cardsUnlocked`: vi "Bài chưa khóa" / en "Cards unlocked"
- `howToPlay.gestures.reorder2`:
  - vi: "Khả dụng khi bài chưa bị khóa."
  - en: "Available while cards are unlocked."
- Add a gesture section:
  - `howToPlay.gestures.lock`: vi "Khóa bài" / en "Locking cards"
  - `howToPlay.gestures.lock1`: vi "Nhấn giữ bài của bạn 1 giây để khóa hoặc
    mở khóa việc xếp bài." / en "Press and hold your hand for 1 second to
    lock or unlock sorting."

### `HowToPlay.tsx`

Add a section `{ titleKey: "howToPlay.gestures.lock", itemKeys:
["howToPlay.gestures.lock1"] }` after the reorder section.

## Out of scope

- No change to swipe-flip / swipe-sort directions or the reorder slot UX.
- No persistence of the lock across sessions; it remains component state.
- No new test framework (the project has none); verification is `npm run build`
  + `npm run lint` + manual review.

## Verification

- `npm run build` passes (type-checks en/vi key parity and TS).
- `npm run lint` passes.
- Manual: long-press own hand 1s -> ring fills and lock toggles; swipe still
  sorts while unlocked; right-click / long-press shows no context menu or text
  selection; a hold does not also select/deselect the pressed card.

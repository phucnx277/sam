# How to Play modal — design

## Goal

Add a "How to play" modal to the game screen containing two tabs: **Game rules** and
**Gestures**. The button that opens it sits directly below the existing TableInfo
(`ℹ️`) button in `src/components/GamePlayer/GamePlayer.tsx`.

## Architecture

- New component `src/components/GamePlayer/HowToPlay.tsx`.
  - Renders the same overlay styling as `TableInfo`: full-screen
    `fixed inset-0 … backdrop-blur-sm` wrapper plus a white rounded card.
  - Header holds two tab buttons (`rules`, `gestures`) and a language switcher is
    intentionally **not** duplicated (the table-info modal already offers one).
  - Tab selection is local `useState`.
  - Renders content from two constant arrays of `{ titleKey, itemsKey }`, where
    every key is a `TranslationKey`.
- `GamePlayer.tsx`:
  - add `shouldShowHowToPlay` state;
  - add a `🙋‍♂️` button directly below the `ℹ️` button;
  - render `<HowToPlay onClose={…} />` when open.
- i18n: new `howToPlay.*` keys in `src/locales/vi.ts` (source of truth) and
  `src/locales/en.ts` (must satisfy the same key set).
- No changes to `src/logic/*`.

## Rules tab content

1. **Setup** — 2–5 players, 10 cards each. First game of a session starts with the
   holder of 3♠; afterwards the previous winner starts.
2. **Valid plays** — single; same-rank set/pair; straight of 3+ consecutive ranks
   (Q-K-A and A-2-3 are valid). The 2 is the highest single and can only be beaten
   by a four-of-a-kind. A 2 may not be left as the final card.
3. **Turn flow** — beat the previous play or pass. When everyone passes, the last
   player opens a new round. Emptying your hand wins.
4. **Calls (Báo / tiger)** — before playing you may declare, believing you hold a
   white-tiger hand. Rank order: Sảnh rồng → Tứ heo → Ba sám → Năm đôi → Đồng màu →
   Nghèo. A false call can be killed.
5. **Chips** — in-round four-of-a-kind ("chặt") penalties; end-of-game payout:
   opponent's remaining cards ×1, "cháy" (10 cards left) = 15, tiger = 20 (30 when
   both sides use Star of hope). BO mode awards 1 chip per win, first to
   `ceil(BO / 2)`.
6. **Đền làng** — the last player who could have beaten the final single card but
   did not pays for everyone.
7. **Star of hope ⭐** — available only when BO is unlimited; doubles all chip
   values.

## Gestures tab content

- Tap a folded card → flip it face-up.
- Tap a face-up card → select / deselect it.
- Swipe left / right → flip all cards face-down / face-up.
- Swipe up / down → sort ascending / descending.
- Mobile portrait swaps the axes: up/down flips, left/right sorts.
- Reorder: select exactly one card, then tap the green slot where it should go.
- Buttons: ⬅️ leave table, ℹ️ table info, 🙋‍♂️ how to play.

## Verification

- `npm run build` (tsc + vite) must pass, confirming both locale files satisfy the
  `TranslationKey` union.
- `npm run lint` must pass.

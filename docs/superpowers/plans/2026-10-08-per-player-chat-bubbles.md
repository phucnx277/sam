# Plan: per-player chat bubbles

Spec: `docs/superpowers/specs/2026-10-08-per-player-chat-bubbles-design.md`

## Steps

1. **New store `src/hooks/useChat.ts`**
   - Zustand singleton: `isOpen`, `bubbles`, `open`, `close`, `pushBubble`,
     `dismissBubble`, `clearBubbles`.
   - Module-level `Map<string, number>` of timers; `BUBBLE_TTL_MS = 4000`,
     `MAX_BUBBLE_MESSAGES = 2`.
   - Default export `useChat`.

2. **`src/components/GamePlayer/TableChat.tsx`**
   - Drop the `isOpen`/`onOpen`/`onClose` props; read them from `useChat`.
   - Replace local `toast` state with store bubbles.
   - Keep `notifiedIdRef` seeding + detection; push foreign messages via
     `pushBubble`.
   - `clearBubbles()` whenever `isOpen`.
   - Render only the fallback top-center toasts for senders whose row is not
     visible (same visibility rule as `PlayingTable`).

3. **`src/components/GamePlayer/PlayerMenu.tsx`**
   - Replace `shouldShowChat` state with `useChat` `isOpen`/`open`/`close`.
   - `<TableChat />` rendered without props.

4. **`src/components/GamePlayer/GamePlayer.tsx`**
   - Read `bubbles[gamePlayer.id]` + `open` from `useChat`.
   - Render the centered, clickable bubble over the card area for non-local
     senders.

5. **`src/index.css`**
   - Add `chat-bubble` fade-in keyframes/class.

6. **Verify**: `npm run build`, `npm run lint`.

## Notes

- No transport, storage, i18n, or type changes.
- Bubbles and the modal panel never coexist (panel open clears bubbles).
- `z-20` bubble above cards + pass-turn banner (`z-10`).

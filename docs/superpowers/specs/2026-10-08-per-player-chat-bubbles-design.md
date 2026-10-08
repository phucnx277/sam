# Per-player chat bubbles

Date: 2026-10-08
Status: approved (autonomous flow)

## Problem

Incoming chat messages while the chat panel is closed are shown as a single
toast at a fixed top-center position (`fixed top-4 left-1/2` in
`TableChat.tsx`). Every player's message appears in the exact same spot; the
only cue for who sent it is the sender's name inside the text. Players want
the message to appear **on the sender**, so it is immediately obvious who said
it.

Each client already lays players out by identity: opponents are placed in a row
at the top (`PlayingTable.tsx`) and the local player sits at the bottom.
`divideGamePlayers` rotates the player list so the local player is first, and
`PlayingTable` filters out not-ready opponents while `game.state === "waiting"`.
So "over the sender's row" is well defined per client.

## Decisions (from brainstorming)

- **One bubble per sender, concurrent.** Multiple players chatting at once
  produce independent bubbles anchored to each sender.
- **Stack up to the last 2 messages per sender** inside that sender's bubble.
- **Lifetime: 4s after the last message**, reset every time that sender sends
  again (a new message extends the bubble).
- **Clicking a bubble opens the chat panel** (same as today's toast).
- **No bubble on the local player's own row** — you already know what you sent
  (matches the current toast rule).
- Bubbles only appear while the chat panel is **closed** (matches current).
- If the sender's row is **not rendered**, fall back to the existing top-center
  toast so no message is lost.

## Approaches considered

- **A (chosen). Per-sender bubbles rendered inside `GamePlayer`, coordinated by
  a small shared store.** The bubble lives in the same React subtree as the
  sender's row, so positioning over their cards needs no DOM measurement. A
  tiny Zustand store (`useChat`) shares the bubble map and the panel-open state
  across the separately-rendered rows and the chat panel.
- B. One component measures each player's DOM rect and absolutely positions all
  bubbles at page level. Avoids a store but requires refs/measurement, breaks on
  layout changes, and duplicates the row geometry. Rejected.
- C. Keep the single global toast and just add the sender's avatar/color. Much
  simpler, but does not satisfy the core request (message should stick to the
  player). Rejected.

## Design

### Shared store (new: `src/hooks/useChat.ts`)

Zustand module-level singleton, matching the `useLocalPlayer` style:

```ts
type ChatBubble = { messages: ChatMessage[] };

type ChatStore = {
  isOpen: boolean;
  bubbles: Record<string, ChatBubble>; // keyed by sender playerId
  open: () => void;
  close: () => void;
  pushBubble: (message: ChatMessage) => void;
  dismissBubble: (playerId: string) => void;
  clearBubbles: () => void;
};
```

- `BUBBLE_TTL_MS = 4000`, `MAX_BUBBLE_MESSAGES = 2`.
- `pushBubble`: keeps the sender's last `MAX_BUBBLE_MESSAGES` messages, replaces
  the entry, and (re)starts a module-level timer that calls `dismissBubble` after
  the TTL. Timers are held in a module-level `Map<string, number>` (outside
  React state) so each sender has its own reset timer.
- `dismissBubble`: clears that sender's timer and removes the entry.
- `clearBubbles`: clears every timer and empties the map.
- `open`/`close`: toggles the panel so bubbles rendered anywhere can open it.

### Detection (`src/components/GamePlayer/TableChat.tsx`)

Keep the existing "new message" detection here (it is mounted exactly once per
client), but source/sink through the store instead of local state:

- Read `isOpen` and actions from `useChat` (props `isOpen`/`onOpen`/`onClose`
  are removed; `PlayerMenu` reads the store instead).
- Keep `notifiedIdRef`, seeded from the last message id when the table id
  changes, so history/reload does not re-notify.
- On a new last message: skip if the panel is open or the id was already
  notified; mark it notified; skip if it is the local player's; otherwise
  `pushBubble(message)`.
- When `isOpen` turns true, `clearBubbles()` so the panel and bubbles never
  coexist.

### Fallback toast (`TableChat.tsx`)

Compute the set of currently visible player ids the same way `PlayingTable`
does:

```ts
visible = players.filter(
  (p) => p.id === localPlayer.id ||
         game.state !== "waiting" ||
         p.isReady,
);
```

Any bubble whose sender is **not** visible is rendered by `TableChat` as a
top-center toast (same styling as today), stacked vertically, still clickable
to open the panel. Normally this set is empty, so the toast only appears in the
rare "sender row filtered out" case.

### Bubble rendering (`src/components/GamePlayer/GamePlayer.tsx`)

Inside the card area (`<div className="relative flex flex-1 w-full gap-x-2">`):

- Read `bubbles[gamePlayer.id]` and `open` from `useChat`.
- Render nothing when `isMe` or no bubble.
- Render an absolutely positioned, centered overlay (`absolute inset-0 z-20 flex
  items-center justify-center`) whose content is a clickable dark pill showing up
  to 2 messages (`name:` + `chatMessageText`), each `line-clamp-3`
  `break-words`, `max-w-[16rem]`. `onClick` calls `open`.
- `z-20` sits above the cards and above the pass-turn banner (`z-10`).

### CSS (`src/index.css`)

Add a small `chat-bubble` fade-in keyframe (opacity + slight translate) so the
bubble eases in; dismissal is an immediate removal.

### i18n

No new keys. The bubble shows the sender `name` + message text; the fallback
reuses existing `chat.*` styling.

## Out of scope

- No avatars/colors, unread counts, typing indicators, or sound.
- No change to how chat is stored or transported (still `Game.chat`, synced via
  `updateTable`).
- No new test framework; verification is `npm run build` + `npm run lint` +
  manual review.

## Verification

- `npm run build` passes (type-checks the new store and component wiring).
- `npm run lint` passes.
- Manual: two clients chat — each sees the other's message in a bubble over the
  sender's cards, up to 2 messages stacked, auto-hiding ~4s after the last one;
  clicking a bubble opens the chat panel; your own messages never bubble; during
  the `waiting` state an unready opponent's message falls back to top-center.

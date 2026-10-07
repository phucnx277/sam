# Table chat (quick messages + free text)

Date: 2026-10-07
Status: approved (autonomous flow)

## Problem

Players sitting at a table have no way to talk to each other. We want an
in-table chat so players can send short preset messages (like "Haha", "My hand
is so bad", "Don't play a single card") as well as free text, right from the
playing table, in both transport modes (PeerJS fast mode and Ably compatible
mode).

## Decision

Add a **table chat** carried inside the shared `Table` object, so it travels on
the existing snapshot sync (PeerJS `sendUpdate` + Ably write-through in
`persistTableToAbly`) with no new transport.

- Chat is stored as `Game.chat: ChatMessage[]`. `newGame()` builds a fresh
  `Game`, so **starting a new game clears chat automatically**; `startGame()`
  spreads the existing game, so chat survives the waiting -> playing
  transition. Messages live for the life of the current game only.
- Messages are removed from the archived `lastGame` so old-game chat is not
  retained.
- Preset ("quick") messages are stored as **i18n keys**, not rendered strings,
  so each viewer sees them in their own language. Free text is stored verbatim
  (single language, whatever the sender typed).
- UI: a 💬 button in the local player's button column opens a chat panel
  (history + quick chips + text input). Incoming messages while the panel is
  closed appear as a **4-second auto-hiding toast**.

## Approaches considered

- **A (chosen). Store chat in `Game.chat`.** Self-clearing on `newGame`, no
  extra reset bookkeeping, and it reuses the existing full-table snapshot sync
  in both transport modes. The cost is coupling social data into the game
  object, accepted because the retention rule is literally "per game".
- B. Store chat in a top-level `Table.chat` and clear it manually in
  `newGame`/`resetSession`/`newTable`. Keeps the game object pure, but adds
  three places that must remember to clear it; easy to miss on future changes.
- C. A separate ephemeral channel (Ably channel / PeerJS message type). Lowest
  payload growth, but needs new protocol plumbing in both transports and would
  not work uniformly in peer-only mode. Rejected as over-engineered for a
  small feature.

## Design

### Types (`src/type.d.ts`)

```ts
type ChatMessage = {
  id: string;
  playerId: string;
  name: string;          // sender name captured at send time
  kind: "quick" | "text";
  ts: number;
  key?: string;          // TranslationKey for kind "quick"
  text?: string;         // sanitized free text for kind "text"
};
```

Add `chat: ChatMessage[];` to `Game`.

### Chat logic (new: `src/logic/chat.ts`)

Framework-free helpers, consistent with `src/logic/*`:

```ts
export const MAX_CHAT_LENGTH = 200;
export const MAX_CHAT_MESSAGES = 200;
export const QUICK_MESSAGE_KEYS: TranslationKey[] = [
  "chat.quick.haha",
  "chat.quick.badHand",
  "chat.quick.noSingle",
  "chat.quick.nice",
  "chat.quick.hurry",
  "chat.quick.goodLuck",
  "chat.quick.soLucky",
  "chat.quick.sorry",
];

normalizeChatText(text: string): string      // collapse whitespace, trim, cap
makeQuickMessage(player: Player, key: TranslationKey): ChatMessage
makeTextMessage(player: Player, text: string): ChatMessage | null
appendChatMessage(table: Table, msg: ChatMessage): Table   // cap to last 200
chatMessageText(msg: ChatMessage, t): string               // t(key) or text
```

- `normalizeChatText`: `text.replace(/\s+/g, " ").trim()`, then cap by code
  points (`Array.from(x).slice(0, MAX_CHAT_LENGTH).join("")`) to avoid cutting
  an emoji in half. Whitespace-only input -> empty -> message rejected.
- `appendChatMessage` reads `table.game.chat ?? []` (older tables may lack the
  field), appends, then trims from the front until the history is within
  `MAX_CHAT_MESSAGES` and `MAX_CHAT_BYTES` (keeping at least the new message).
  The byte budget keeps the chat well under Ably's 64 KiB per-operation limit,
  because the whole `game` value (chat included) is written as one LiveMap
  value.
- Sender name/id come from `Player`; `ts` is `Date.now()` on the sender.
- `id` from `generateId("msg")`.

### Game creation (`src/logic/game.ts`)

- `newGame()` adds `chat: []` (this is the single clearing point).
- `ActionDef.newGame.handleAction` archives `lastGame: { ...playingTable.game,
  chat: [] }` so old-game messages are not retained.

### Send API (`src/hooks/useAppData.ts`)

Add `sendChat` and expose it from the hook:

```ts
type ChatInput =
  | { type: "quick"; key: TranslationKey }
  | { type: "text"; text: string };

sendChat(input: ChatInput): Promise<Error | null>;
```

Implementation reads the current `playingTable` + `localPlayer`, ignores the
call when the local player is not in `game.players`, builds the message
(rejecting empty text), appends it to the game, and calls the existing
`updateTable(next)`. Because `updateTable` optimistically calls
`setPlayingTable` and then `sendUpdate` + `persistTableToAbly`, the sender sees
the message immediately and every transport propagates it. No changes to
`logic/peer.ts` or the Ably subscription code are needed.

### UI (new: `src/components/GamePlayer/TableChat.tsx`)

Self-contained component rendered inside the local player's button column in
`GamePlayer.tsx` (next to ℹ️ / 🔗 / 🙋). It returns a fragment so it can render
the inline button plus two fixed overlays:

- **Button:** `💬`, `title`/`aria-label` = `t("chat.open")`.
- **Panel** (open state): modal overlay matching `TableInfo`/`HowToPlay`
  (fixed inset-0, backdrop-blur-sm, white rounded card, × close):
  - scrollable message list; each row shows the sender name and the rendered
    message (`chatMessageText`), own messages visually distinguished;
  - empty state `t("chat.empty")`;
  - quick-message chips from `QUICK_MESSAGE_KEYS` (`t(key)` labels), sending on
    click;
  - a text input (`maxLength={MAX_CHAT_LENGTH}`) + send button; Enter submits.
  - auto-scrolls to the newest message when opened or when a message arrives.
- **Toast:** while the panel is closed, the newest incoming message (not sent
  by me) shows for 4s at the top-center; clicking it opens the panel. A local
  ref tracks the last-notified message id so re-renders and reload/rejoin do
  not re-toast history and the sender does not toast their own message.

### i18n (`src/locales/vi.ts`, `src/locales/en.ts`)

Add a `chat.*` block (vi is source of truth; en must match keys):

- `chat.title` — "Trò chuyện" / "Chat"
- `chat.open` — "Trò chuyện" / "Chat"
- `chat.placeholder` — "Nhập tin nhắn" / "Type a message"
- `chat.send` — "Gửi" / "Send"
- `chat.empty` — "Chưa có tin nhắn nào" / "No messages yet"
- `chat.quick.haha` — "Haha" / "Haha"
- `chat.quick.badHand` — "Bài tôi tệ quá" / "My hand is so bad"
- `chat.quick.noSingle` — "Đừng đánh lá nào" / "Don't play a single card"
- `chat.quick.nice` — "Hay lắm!" / "Nice one!"
- `chat.quick.hurry` — "Mau lên!" / "Hurry up!"
- `chat.quick.goodLuck` — "Chúc may mắn!" / "Good luck!"
- `chat.quick.soLucky` — "May ghê!" / "So lucky!"
- `chat.quick.sorry` — "Xin lỗi!" / "Sorry!"

Update `howToPlay.gestures.buttons1` to mention the 💬 chat button.

## Security / safety

- Free text is rendered as React children (auto-escaped); no HTML/URL handling.
- Length capped at 200 code points, whitespace normalized, empty rejected.
- History is kept for the current game only, bounded by both a 200-message
  count cap and a 24 KiB serialized-size cap to keep Ably operations under its
  64 KiB limit.
- Only players currently in `game.players` can send.

## Out of scope

- No typing indicators, read receipts, unread badges, mentions, images/links, or
  message deletion/editing.
- No moderation or rate limiting beyond the length and count caps.
- No persistence across games or after leaving the table (chat is tied to the
  current game object).
- No new test framework (the project has none); verification is `npm run build`
  + `npm run lint` + manual review.

## Verification

- `npm run build` passes (type-checks `Game.chat`, `TranslationKey`, en/vi key
  parity).
- `npm run lint` passes.
- Manual: open 💬, send a quick message and free text -> both appear instantly
  for the sender; a second client in the same table sees them; a new game
  clears the history; incoming messages toast for 4s while the panel is closed;
  the same works in Ably fallback mode.

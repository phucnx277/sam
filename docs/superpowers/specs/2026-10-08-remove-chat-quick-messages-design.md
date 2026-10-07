# Remove table chat quick messages

Date: 2026-10-08
Status: approved (autonomous flow)

## Problem

Table chat (see `2026-10-07-table-chat-design.md`) ships with eight preset
"quick message" chips in addition to a free-text input. We no longer want the
preset chips; free-text chat stays.

## Decision

Remove quick messages entirely — the chip UI, the logic that builds them, the
message-kind fields, and the eight `chat.quick.*` i18n keys — while keeping
free-text chat, transport, caps, panel, and toast unchanged.

Compatibility: a quick message only carried an i18n `key`, not text. A table
snapshot that still contains a legacy quick message (e.g. an in-flight game
from an older client) must not crash. To make this safe, `text` stays optional
in the type and the render helper falls back to `""`; legacy quick messages
render with a blank body until the game ends. New text messages render on both
old and new clients because old code falls through to `message.text`.

## Approaches considered

- **A (chosen). Full removal.** Delete the chip row, `QUICK_MESSAGE_KEYS`,
  `makeQuickMessage`, the `quick` variant of the send input, the `kind`/`key`
  message fields, and the eight locale keys. Least code, matches intent, YAGNI.
- B. Hide the chips but keep the logic/types/keys. Leaves dead code and a
  `kind` discriminator nothing uses. Rejected.

## Design

### `src/type.d.ts`

`ChatMessage` becomes:

```ts
type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  ts: number;
  text?: string;
};
```

(`kind` and `key` removed; `text` optional for the legacy-payload fallback.)

### `src/logic/chat.ts`

- Remove `QUICK_MESSAGE_KEYS` and `makeQuickMessage`.
- `makeTextMessage(player, text)` still returns `ChatMessage | null`, setting
  `{ id, playerId, name, ts, text: normalized }` (no `kind`).
- `chatMessageText(message)` loses the translate parameter and quick branch and
  simply returns `message.text ?? ""`.

Unchanged: `MAX_CHAT_LENGTH`, `MAX_CHAT_MESSAGES`, `MAX_CHAT_BYTES`,
`normalizeChatText`, `appendChatMessage`.

### `src/hooks/useAppData.ts`

- Remove the `ChatInput` union and the now-unused `TranslationKey` import and
  `makeQuickMessage` import.
- `sendChat` takes `text: string`; the membership guard and `makeTextMessage`
  null-check are unchanged.

### `src/components/GamePlayer/TableChat.tsx`

- Remove the quick-chips `<div>` and the `sendQuick` handler.
- Remove the `QUICK_MESSAGE_KEYS` and `TranslationKey` imports.
- `submitText` calls `sendChat(text)`.
- Render `chatMessageText(message)` / `chatMessageText(toast)`.

### `src/locales/vi.ts`, `src/locales/en.ts`

Remove the eight `chat.quick.*` keys. Remaining `chat.*` keys (title, open,
placeholder, send, empty) stay.

## Out of scope

- No change to free-text chat behavior, the transport (`updateTable`), the
  200-message / 24 KiB caps, the panel, or the toast.
- No change to the how-to-play text (it mentions the 💬 button, not chips).
- No new test framework; verification is `npm run build` + `npm run lint`.

## Verification

- `npm run build` passes (type-checks the `ChatMessage` shape and en/vi key
  parity after removing the quick keys).
- `npm run lint` passes.
- Manual: open 💬 -> no chip row; typing and sending still works; a legacy quick
  message in a loaded table renders without error.

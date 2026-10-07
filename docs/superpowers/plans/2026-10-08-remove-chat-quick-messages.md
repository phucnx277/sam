# Remove Table Chat Quick Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the preset quick-message chips and all supporting code from table chat, leaving free-text chat intact.

**Architecture:** Table chat stores messages in `Game.chat` and syncs via the existing `Table` snapshot transport. This change is a pure deletion + simplification: drop the `kind`/`key` fields, quick-message factories/keys, the `ChatInput` union, the chip UI, and the eight `chat.quick.*` i18n keys.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4, custom i18n. No test framework — verification is `npm run build` + `npm run lint`.

---

## File Structure

- `src/type.d.ts` — simplify `ChatMessage`.
- `src/logic/chat.ts` — remove quick keys/factory; simplify the render helper.
- `src/hooks/useAppData.ts` — `sendChat(text: string)`; drop `ChatInput`/imports.
- `src/components/GamePlayer/TableChat.tsx` — remove chips + `sendQuick`.
- `src/locales/vi.ts`, `src/locales/en.ts` — remove `chat.quick.*` keys.

---

### Task 1: Remove quick messages

**Files:**
- Modify: `src/type.d.ts`
- Modify: `src/logic/chat.ts`
- Modify: `src/hooks/useAppData.ts`
- Modify: `src/components/GamePlayer/TableChat.tsx`
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Simplify `ChatMessage` in `src/type.d.ts`**

Replace:

```ts
type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  kind: "quick" | "text";
  ts: number;
  key?: string;
  text?: string;
};
```

with:

```ts
type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  ts: number;
  text?: string;
};
```

- [ ] **Step 2: Simplify `src/logic/chat.ts`**

Replace the entire file contents with:

```ts
import { generateId } from "./util";

export const MAX_CHAT_LENGTH = 200;
export const MAX_CHAT_MESSAGES = 200;
// Keep the chat snapshots well under Ably's 64 KiB per-operation limit, since
// the whole `game` value (including chat) is written as one LiveMap value.
export const MAX_CHAT_BYTES = 24000;

const chatByteSize = (messages: ChatMessage[]): number =>
  new TextEncoder().encode(JSON.stringify(messages)).length;

export const normalizeChatText = (text: string): string =>
  Array.from(text.replace(/\s+/g, " ").trim())
    .slice(0, MAX_CHAT_LENGTH)
    .join("");

export const makeTextMessage = (
  player: Player,
  text: string,
): ChatMessage | null => {
  const normalized = normalizeChatText(text);
  if (!normalized) return null;
  return {
    id: generateId("msg"),
    playerId: player.id,
    name: player.name,
    text: normalized,
    ts: Date.now(),
  };
};

export const appendChatMessage = (
  table: Table,
  message: ChatMessage,
): Table => {
  const messages = [...(table.game.chat ?? []), message];
  while (
    messages.length > 1 &&
    (messages.length > MAX_CHAT_MESSAGES ||
      chatByteSize(messages) > MAX_CHAT_BYTES)
  ) {
    messages.shift();
  }
  return {
    ...table,
    game: { ...table.game, chat: messages },
  };
};

export const chatMessageText = (message: ChatMessage): string =>
  message.text ?? "";
```

(This removes `QUICK_MESSAGE_KEYS`, `makeQuickMessage`, the `TranslationKey` import, and the quick branch in `chatMessageText`.)

- [ ] **Step 3: Simplify chat imports and `ChatInput` in `src/hooks/useAppData.ts`**

Replace:

```ts
import {
  appendChatMessage,
  makeQuickMessage,
  makeTextMessage,
} from "@logic/chat";
import type { TranslationKey } from "@logic/i18n";
```

with:

```ts
import { appendChatMessage, makeTextMessage } from "@logic/chat";
```

Replace:

```ts
export type ChatInput =
  | { type: "quick"; key: TranslationKey }
  | { type: "text"; text: string };
```

with nothing (delete the block, including its trailing blank line).

- [ ] **Step 4: Make `sendChat` take text in `src/hooks/useAppData.ts`**

Replace:

```ts
  const sendChat = useCallback(
    async (input: ChatInput): Promise<Error | null> => {
      const table = useAblyStore.getState().playingTable;
      const localPlayer = useLocalPlayer.getState().localPlayer;
      if (!table || !localPlayer) return null;
      if (!table.game.players.some((item) => item.id === localPlayer.id)) {
        return null;
      }
      const message =
        input.type === "quick"
          ? makeQuickMessage(localPlayer, input.key)
          : makeTextMessage(localPlayer, input.text);
      if (!message) return null;
      return updateTable(appendChatMessage(table, message));
    },
    [updateTable],
  );
```

with:

```ts
  const sendChat = useCallback(
    async (text: string): Promise<Error | null> => {
      const table = useAblyStore.getState().playingTable;
      const localPlayer = useLocalPlayer.getState().localPlayer;
      if (!table || !localPlayer) return null;
      if (!table.game.players.some((item) => item.id === localPlayer.id)) {
        return null;
      }
      const message = makeTextMessage(localPlayer, text);
      if (!message) return null;
      return updateTable(appendChatMessage(table, message));
    },
    [updateTable],
  );
```

- [ ] **Step 5: Remove the chip UI in `src/components/GamePlayer/TableChat.tsx`**

Replace the import block:

```tsx
import type { TranslationKey } from "@logic/i18n";
import {
  chatMessageText,
  MAX_CHAT_LENGTH,
  QUICK_MESSAGE_KEYS,
} from "@logic/chat";
```

with:

```tsx
import { chatMessageText, MAX_CHAT_LENGTH } from "@logic/chat";
```

Replace the two send handlers:

```tsx
  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void sendChat({ type: "text", text });
    setDraft("");
  };

  const sendQuick = (key: TranslationKey) => {
    void sendChat({ type: "quick", key });
  };
```

with:

```tsx
  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void sendChat(text);
    setDraft("");
  };
```

Delete the quick-chips block entirely:

```tsx
            <div className="mt-2 flex flex-wrap gap-1">
              {QUICK_MESSAGE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="!py-1 !px-2 text-xs border border-cyan-300 rounded-sm hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
                  onClick={() => sendQuick(key)}
                >
                  {t(key)}
                </button>
              ))}
            </div>

```

Change the two render calls from `chatMessageText(message, t)` and `chatMessageText(toast, t)` to `chatMessageText(message)` and `chatMessageText(toast)` respectively.

- [ ] **Step 6: Remove the `chat.quick.*` keys from both locales**

In `src/locales/vi.ts` delete these eight lines:

```ts
  "chat.quick.haha": "Haha",
  "chat.quick.badHand": "Bài tôi tệ quá",
  "chat.quick.noSingle": "Đừng đánh lá nào",
  "chat.quick.nice": "Hay lắm!",
  "chat.quick.hurry": "Mau lên!",
  "chat.quick.goodLuck": "Chúc may mắn!",
  "chat.quick.soLucky": "May ghê!",
  "chat.quick.sorry": "Xin lỗi!",
```

In `src/locales/en.ts` delete these eight lines:

```ts
  "chat.quick.haha": "Haha",
  "chat.quick.badHand": "My hand is so bad",
  "chat.quick.noSingle": "Don't play a single card",
  "chat.quick.nice": "Nice one!",
  "chat.quick.hurry": "Hurry up!",
  "chat.quick.goodLuck": "Good luck!",
  "chat.quick.soLucky": "So lucky!",
  "chat.quick.sorry": "Sorry!",
```

- [ ] **Step 7: Verify build and lint**

Run: `npm run build` — Expected PASS.
Run: `npm run lint` — Expected PASS with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/type.d.ts src/logic/chat.ts src/hooks/useAppData.ts src/components/GamePlayer/TableChat.tsx src/locales/vi.ts src/locales/en.ts
git commit -m "feat: remove table chat quick messages"
```

---

## Self-Review

- **Spec coverage:** type simplification (Step 1), logic removal (Step 2), send API (Steps 3-4), UI removal (Step 5), i18n removal (Step 6). Covered.
- **Placeholder scan:** none.
- **Type consistency:** `chatMessageText` is one-arg everywhere after Step 5; `sendChat` is `(text: string)` in both definition and call site; no remaining references to `QUICK_MESSAGE_KEYS`, `makeQuickMessage`, `ChatInput`, or `TranslationKey` in the chat path.
- **No tests:** project has none; build + lint are the verification.

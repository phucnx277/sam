# Table Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players seated at a table can exchange preset quick messages and free-text chat, synced through the existing `Table` snapshot transport in both PeerJS and Ably modes.

**Architecture:** Chat is stored as `Game.chat: ChatMessage[]`; because `newGame()` builds a fresh `Game`, a new game clears chat, and `startGame()` spreads the game so chat survives waiting -> playing. Sending appends a message to the game and calls the existing `updateTable`, which optimistically updates the local table then broadcasts via PeerJS (`sendUpdate`) and writes through to Ably (`persistTableToAbly`). Quick messages are stored as i18n keys so each viewer renders them in their own locale; free text is sanitized and stored verbatim.

**Tech Stack:** React 19, TypeScript, Zustand stores, Tailwind v4, custom i18n layer (`@logic/i18n`). No test framework exists — verification is `npm run build` (which runs `tsc -b`) plus `npm run lint`.

---

## File Structure

- `src/type.d.ts` — add global ambient `ChatMessage` type; add `chat` to `Game`.
- `src/logic/chat.ts` (new) — framework-free chat helpers: constants, message factories, sanitizer, append, render text.
- `src/logic/game.ts` — `newGame()` initializes `chat: []`; `ActionDef.newGame` strips chat from archived `lastGame`.
- `src/logic/util.ts` — unchanged (JSON serialization already handles the new field).
- `src/hooks/useAppData.ts` — add `ChatInput` type and `sendChat` callback; export it.
- `src/components/GamePlayer/TableChat.tsx` (new) — 💬 button, chat panel, incoming-message toast.
- `src/components/GamePlayer/GamePlayer.tsx` — render `<TableChat />` in the local player's button column.
- `src/locales/vi.ts`, `src/locales/en.ts` — add `chat.*` keys; extend `howToPlay.gestures.buttons1`.

---

### Task 1: Data model, chat logic, and i18n strings

**Files:**
- Modify: `src/type.d.ts`
- Modify: `src/logic/game.ts`
- Create: `src/logic/chat.ts`
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add the `ChatMessage` type and `Game.chat`**

In `src/type.d.ts`, immediately after the `PlayHistory` type block, add:

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

In the same file, add a `chat` field to `Game` (after `playHistory: PlayHistory[];`):

```ts
  playHistory: PlayHistory[];
  chat: ChatMessage[];
```

- [ ] **Step 2: Initialize `chat` in `newGame()`**

In `src/logic/game.ts`, the object returned by `newGame` currently ends with:

```ts
    playHistory: [],
    winnerId: null,
```

Insert `chat: []` between them so it reads:

```ts
    playHistory: [],
    chat: [],
    winnerId: null,
```

- [ ] **Step 3: Create `src/logic/chat.ts`**

```ts
import type { TranslationKey } from "./i18n";
import { generateId } from "./util";

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

export const normalizeChatText = (text: string): string =>
  Array.from(text.replace(/\s+/g, " ").trim())
    .slice(0, MAX_CHAT_LENGTH)
    .join("");

export const makeQuickMessage = (
  player: Player,
  key: TranslationKey,
): ChatMessage => ({
  id: generateId("msg"),
  playerId: player.id,
  name: player.name,
  kind: "quick",
  key,
  ts: Date.now(),
});

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
    kind: "text",
    text: normalized,
    ts: Date.now(),
  };
};

export const appendChatMessage = (
  table: Table,
  message: ChatMessage,
): Table => ({
  ...table,
  game: {
    ...table.game,
    chat: [...(table.game.chat ?? []), message].slice(-MAX_CHAT_MESSAGES),
  },
});

export const chatMessageText = (
  message: ChatMessage,
  translate: (key: TranslationKey) => string,
): string => {
  if (message.kind === "quick" && message.key) {
    return translate(message.key as TranslationKey);
  }
  return message.text ?? "";
};
```

- [ ] **Step 4: Add `chat.*` i18n keys to both locales**

In `src/locales/vi.ts`, insert this block after the `"game.fallbackMode"` line:

```ts
  "chat.title": "Trò chuyện",
  "chat.open": "Trò chuyện",
  "chat.placeholder": "Nhập tin nhắn",
  "chat.send": "Gửi",
  "chat.empty": "Chưa có tin nhắn nào",
  "chat.quick.haha": "Haha",
  "chat.quick.badHand": "Bài tôi tệ quá",
  "chat.quick.noSingle": "Đừng đánh lá nào",
  "chat.quick.nice": "Hay lắm!",
  "chat.quick.hurry": "Mau lên!",
  "chat.quick.goodLuck": "Chúc may mắn!",
  "chat.quick.soLucky": "May ghê!",
  "chat.quick.sorry": "Xin lỗi!",
```

In `src/locales/en.ts`, insert the matching block after the `"game.fallbackMode"` line:

```ts
  "chat.title": "Chat",
  "chat.open": "Chat",
  "chat.placeholder": "Type a message",
  "chat.send": "Send",
  "chat.empty": "No messages yet",
  "chat.quick.haha": "Haha",
  "chat.quick.badHand": "My hand is so bad",
  "chat.quick.noSingle": "Don't play a single card",
  "chat.quick.nice": "Nice one!",
  "chat.quick.hurry": "Hurry up!",
  "chat.quick.goodLuck": "Good luck!",
  "chat.quick.soLucky": "So lucky!",
  "chat.quick.sorry": "Sorry!",
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: PASS (no TypeScript errors; `en` still satisfies `Record<TranslationKey, string>`).

- [ ] **Step 6: Commit**

```bash
git add src/type.d.ts src/logic/game.ts src/logic/chat.ts src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add table chat data model, logic, and strings"
```

---

### Task 2: Chat send API and old-game archiving

**Files:**
- Modify: `src/hooks/useAppData.ts`
- Modify: `src/logic/game.ts`

- [ ] **Step 1: Strip chat when archiving the previous game**

In `src/logic/game.ts`, inside `ActionDef.newGame.handleAction`, change:

```ts
        lastGame: playingTable.game,
```

to:

```ts
        lastGame: { ...playingTable.game, chat: [] },
```

- [ ] **Step 2: Add the `ChatInput` type and `sendChat` to `useAppData`**

In `src/hooks/useAppData.ts`, add to the imports:

```ts
import {
  appendChatMessage,
  makeQuickMessage,
  makeTextMessage,
} from "@logic/chat";
import type { TranslationKey } from "@logic/i18n";
```

After the existing line `export type PeerError = JoinRejectReason | "unreachable";`, add:

```ts
export type ChatInput =
  | { type: "quick"; key: TranslationKey }
  | { type: "text"; text: string };
```

Inside the `useAppData` hook, immediately after the `updateTable` `useCallback` block (before `const enterTable = ...`), add:

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

In the hook's returned object, add `sendChat` next to `updateTable`:

```ts
    updateTable,
    sendChat,
    isUpdatingTable,
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppData.ts src/logic/game.ts
git commit -m "feat: add sendChat and clear chat on new game"
```

---

### Task 3: Chat UI (button, panel, toast) and GamePlayer wiring

**Files:**
- Create: `src/components/GamePlayer/TableChat.tsx`
- Modify: `src/components/GamePlayer/GamePlayer.tsx`
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Create `src/components/GamePlayer/TableChat.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import type { TranslationKey } from "@logic/i18n";
import {
  chatMessageText,
  MAX_CHAT_LENGTH,
  QUICK_MESSAGE_KEYS,
} from "@logic/chat";

const TableChat = () => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { playingTable, sendChat } = useAppData();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<ChatMessage | null>(null);
  const notifiedIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chat = playingTable?.game.chat ?? [];
  const lastMessage = chat[chat.length - 1];

  useEffect(() => {
    if (notifiedIdRef.current === null && lastMessage) {
      notifiedIdRef.current = lastMessage.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (isOpen || lastMessage.id === notifiedIdRef.current) {
      notifiedIdRef.current = lastMessage.id;
      return;
    }
    notifiedIdRef.current = lastMessage.id;
    if (lastMessage.playerId === localPlayer?.id) return;
    setToast(lastMessage);
  }, [lastMessage, isOpen, localPlayer?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isOpen, chat.length]);

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

  return (
    <>
      <button
        className="!p-0"
        title={t("chat.open")}
        aria-label={t("chat.open")}
        onClick={() => setIsOpen(true)}
      >
        💬
      </button>

      {isOpen && (
        <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="relative bg-white flex flex-col p-3 lg:p-4 rounded-lg shadow-2xl shadow-gray-400 w-[26rem] max-w-[92%] max-h-[85%]">
            <div className="text-center text-lg font-semibold">
              {t("chat.title")}
            </div>
            <span
              className="absolute text-2xl right-4 top-2 font-normal cursor-pointer text-gray-500 hover:text-gray-800 active:text-gray-800 focus:text-gray-800"
              onClick={() => setIsOpen(false)}
            >
              {"×"}
            </span>

            <div
              ref={listRef}
              className="mt-2 flex-1 overflow-y-auto pr-1 flex flex-col gap-y-2 min-h-[8rem] max-h-[50vh]"
            >
              {chat.length === 0 && (
                <div className="text-center text-sm text-gray-400">
                  {t("chat.empty")}
                </div>
              )}
              {chat.map((message) => {
                const mine = message.playerId === localPlayer?.id;
                return (
                  <div key={message.id} className="text-sm break-words">
                    <span
                      className={
                        mine ? "font-semibold text-cyan-700" : "font-semibold"
                      }
                    >
                      {message.name}
                    </span>
                    {": "}
                    <span>{chatMessageText(message, t)}</span>
                  </div>
                );
              })}
            </div>

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

            <form className="mt-2 flex gap-x-2" onSubmit={submitText}>
              <input
                className="flex-1 min-w-0 !px-2 border border-gray-300 rounded-sm"
                value={draft}
                maxLength={MAX_CHAT_LENGTH}
                placeholder={t("chat.placeholder")}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="submit"
                className="!px-3 border border-green-600 bg-green-600 text-white rounded-sm disabled:opacity-50"
                disabled={!draft.trim()}
              >
                {t("chat.send")}
              </button>
            </form>
          </div>
        </div>
      )}

      {!isOpen && toast && (
        <div
          className="fixed z-20 top-4 left-1/2 -translate-x-1/2 max-w-[90%] bg-gray-800/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg cursor-pointer"
          onClick={() => {
            setToast(null);
            setIsOpen(true);
          }}
        >
          <span className="font-semibold">{toast.name}</span>
          {": "}
          <span>{chatMessageText(toast, t)}</span>
        </div>
      )}
    </>
  );
};

export default TableChat;
```

- [ ] **Step 2: Render `<TableChat />` in `GamePlayer.tsx`**

In `src/components/GamePlayer/GamePlayer.tsx`, add the import:

```ts
import TableChat from "./TableChat";
```

Inside the `{isMe && ( <div className="flex flex-col"> ... </div> )}` block, after the `shouldShowHowToPlay` block (the last element before the closing `</div>`), add:

```tsx
              <TableChat />
```

- [ ] **Step 3: Mention the chat button in the how-to-play text**

In `src/locales/vi.ts`, change:

```ts
  "howToPlay.gestures.buttons1":
    "⬅️ rời bàn, ℹ️ thông tin bàn, 🔗 chia sẻ bàn, 🙋‍♂️ hướng dẫn chơi.",
```

to:

```ts
  "howToPlay.gestures.buttons1":
    "⬅️ rời bàn, ℹ️ thông tin bàn, 🔗 chia sẻ bàn, 🙋‍♂️ hướng dẫn chơi, 💬 trò chuyện.",
```

In `src/locales/en.ts`, change:

```ts
  "howToPlay.gestures.buttons1":
    "⬅️ leave the table, ℹ️ table info, 🔗 share the table, 🙋‍♂️ how to play.",
```

to:

```ts
  "howToPlay.gestures.buttons1":
    "⬅️ leave the table, ℹ️ table info, 🔗 share the table, 🙋‍♂️ how to play, 💬 chat.",
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build`
Expected: PASS.

Run: `npm run lint`
Expected: PASS with no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/GamePlayer/TableChat.tsx src/components/GamePlayer/GamePlayer.tsx src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add table chat panel with quick messages and toast"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Confirm working tree is clean**

Run: `git status --short`
Expected: no uncommitted source changes (the pre-commit hook bumps `package.json` version on each code commit; that bump is already committed with its own task commit).

---

## Self-Review

- **Spec coverage:** `Game.chat` + `ChatMessage` (Task 1); clear chat on new game and strip old-game chat (Tasks 1-2); `logic/chat.ts` factories/sanitizer/cap/render (Task 1); `sendChat` via `updateTable` (Task 2); 💬 button + panel (history, quick chips, input) + 4s toast (Task 3); all `chat.*` keys and how-to-play text (Tasks 1, 3). Covered.
- **Placeholder scan:** none — all code is concrete.
- **Type consistency:** `ChatInput`, `sendChat`, `ChatMessage`, `appendChatMessage`, `makeQuickMessage`, `makeTextMessage`, `chatMessageText`, `QUICK_MESSAGE_KEYS`, `MAX_CHAT_LENGTH` names are used identically across tasks.
- **No tests:** the project has no test framework (per AGENTS.md), so verification is build + lint, as above.

# Local-player Action FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local player's four-icon button column with a single tap-friendly floating action button that opens a labelled popover menu (`ℹ️ Table info`, `🔗 Share`, `🙋 How to play`, `💬 Chat`).

**Architecture:** A new self-contained `PlayerMenu.tsx` owns the FAB, the popover, and the four modal open-states. `TableChat` is refactored from a self-opening component into a controlled panel (`isOpen`/`onOpen`/`onClose`). `GamePlayer.tsx` drops the icon column and merely renders `<PlayerMenu />` for the local player.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (no config, arbitrary values allowed), Zustand hooks, Vite. No test framework — verification is `npm run build` + `npm run lint` + manual review.

**Note on commits:** The pre-commit hook (`.husky/pre-commit`) runs `npm run build`, bumps the patch version, and `git add -u`, so every code commit must have a green build. Because the `TableChat` prop change, the new `PlayerMenu`, and the `GamePlayer` consumer are mutually dependent, they land in **one** commit (Task 2).

---

## File Structure

- `src/locales/vi.ts` — add `game.menu`, `game.tableInfo`; rewrite `howToPlay.gestures.buttons1` (source of truth).
- `src/locales/en.ts` — same keys/rewrite (must match vi key set).
- `src/components/GamePlayer/TableChat.tsx` — remove inline button + `isOpen` state; accept `isOpen`/`onOpen`/`onClose` props.
- `src/components/GamePlayer/PlayerMenu.tsx` — **new** component: FAB + popover + modals.
- `src/components/GamePlayer/GamePlayer.tsx` — delete icon column + unused state/imports; render `<PlayerMenu />`.

---

### Task 1: i18n keys for the menu

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add the two new keys to `src/locales/vi.ts`**

In the `game.*` block, after `"game.fallbackMode": "Kết nối tương thích",` (around vi.ts:72), add:

```ts
  "game.menu": "Tùy chọn",
  "game.tableInfo": "Thông tin bàn",
```

- [ ] **Step 2: Add the same keys to `src/locales/en.ts`**

After `"game.fallbackMode": "Compatible connection",` (around en.ts:76), add:

```ts
  "game.menu": "Options",
  "game.tableInfo": "Table info",
```

- [ ] **Step 3: Rewrite `howToPlay.gestures.buttons1` in `src/locales/vi.ts`**

Replace:

```ts
  "howToPlay.gestures.buttons1":
    "🔙 rời bàn, ℹ️ thông tin bàn, 🔗 chia sẻ bàn, 🙋‍♂️ hướng dẫn chơi, 💬 trò chuyện.",
```

with:

```ts
  "howToPlay.gestures.buttons1":
    "🔙 rời bàn. Nút ☰ mở menu: ℹ️ thông tin bàn, 🔗 chia sẻ bàn, 🙋‍♂️ hướng dẫn chơi, 💬 trò chuyện.",
```

- [ ] **Step 4: Rewrite `howToPlay.gestures.buttons1` in `src/locales/en.ts`**

Replace:

```ts
  "howToPlay.gestures.buttons1":
    "🔙 leave the table, ℹ️ table info, 🔗 share the table, 🙋‍♂️ how to play, 💬 chat.",
```

with:

```ts
  "howToPlay.gestures.buttons1":
    "🔙 leave the table. The ☰ button opens a menu: ℹ️ table info, 🔗 share the table, 🙋‍♂️ how to play, 💬 chat.",
```

- [ ] **Step 5: Verify build (type-checks vi/en key parity)**

Run: `npm run build`
Expected: PASS (no "Type ... is not assignable" / missing-key errors).

- [ ] **Step 6: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat: i18n keys for player action menu"
```

---

### Task 2: Action FAB (TableChat refactor + PlayerMenu + GamePlayer)

**Files:**
- Modify: `src/components/GamePlayer/TableChat.tsx`
- Create: `src/components/GamePlayer/PlayerMenu.tsx`
- Modify: `src/components/GamePlayer/GamePlayer.tsx`

- [ ] **Step 1: Make `TableChat` controlled — signature + drop internal open-state**

In `src/components/GamePlayer/TableChat.tsx`, replace:

```tsx
const TableChat = () => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { playingTable, sendChat } = useAppData();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
```

with:

```tsx
const TableChat = ({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { playingTable, sendChat } = useAppData();
  const [draft, setDraft] = useState("");
```

- [ ] **Step 2: Remove the inline 💬 button from `TableChat`'s render tree**

Delete this block at the top of the returned fragment:

```tsx
      <button
        className="!p-0"
        title={t("chat.open")}
        aria-label={t("chat.open")}
        onClick={() => setIsOpen(true)}
      >
        💬
      </button>

```

Leave the `<>` fragment, the `{isOpen && (…panel…)}` block, and the toast block.

- [ ] **Step 3: Route the chat panel close through `onClose`**

In `TableChat`, replace the panel's × close handler:

```tsx
              onClick={() => setIsOpen(false)}
```

with:

```tsx
              onClick={onClose}
```

- [ ] **Step 4: Route the toast tap through `onOpen`**

In `TableChat`, replace the toast click handler:

```tsx
            onClick={() => {
              setToast(null);
              setIsOpen(true);
            }}
```

with:

```tsx
            onClick={() => {
              setToast(null);
              onOpen();
            }}
```

- [ ] **Step 5: Confirm no dangling `setIsOpen`**

Run: `rg "setIsOpen" src/components/GamePlayer/TableChat.tsx`
Expected: no output.

- [ ] **Step 6: Create `src/components/GamePlayer/PlayerMenu.tsx`**

```tsx
import { useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import TableInfo from "../Tables/TableInfo";
import ShareTable from "../Tables/ShareTable";
import HowToPlay from "./HowToPlay";
import TableChat from "./TableChat";

type MenuActionKey = "info" | "share" | "howToPlay" | "chat";

const PlayerMenu = () => {
  const { t } = useI18n();
  const { playingTable } = useAppData();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [shouldShowTableInfo, setShouldShowTableInfo] = useState(false);
  const [shouldShowShareTable, setShouldShowShareTable] = useState(false);
  const [shouldShowHowToPlay, setShouldShowHowToPlay] = useState(false);
  const [shouldShowChat, setShouldShowChat] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const actions: { key: MenuActionKey; emoji: string; label: string }[] = [
    { key: "info", emoji: "ℹ️", label: t("game.tableInfo") },
    { key: "share", emoji: "🔗", label: t("table.share") },
    { key: "howToPlay", emoji: "🙋‍♂️", label: t("howToPlay.title") },
    { key: "chat", emoji: "💬", label: t("chat.open") },
  ];

  const selectAction = (key: MenuActionKey) => {
    setIsMenuOpen(false);
    switch (key) {
      case "info":
        setShouldShowTableInfo(true);
        break;
      case "share":
        setShouldShowShareTable(true);
        break;
      case "howToPlay":
        setShouldShowHowToPlay(true);
        break;
      case "chat":
        setShouldShowChat(true);
        break;
    }
  };

  return (
    <>
      {isMenuOpen && (
        <div
          className="fixed z-[4] top-0 right-0 bottom-0 left-0"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {isMenuOpen && (
        <div
          role="menu"
          className="fixed z-[6] bottom-16 right-3 lg:bottom-20 lg:right-6 flex flex-col gap-y-1 bg-white p-1 rounded-lg shadow-2xl shadow-gray-400 min-w-[10rem]"
        >
          {actions.map((action) => (
            <button
              key={action.key}
              role="menuitem"
              className="flex items-center gap-x-2 px-3 py-2 rounded-sm text-left hover:bg-cyan-100 active:bg-cyan-100 focus:bg-cyan-100"
              onClick={() => selectAction(action.key)}
            >
              <span>{action.emoji}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="!p-0 fixed z-[5] bottom-3 right-3 lg:bottom-6 lg:right-6 flex items-center justify-center size-12 rounded-full bg-cyan-600 text-white text-2xl shadow-lg shadow-gray-400/50"
        title={t("game.menu")}
        aria-label={t("game.menu")}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((prev) => !prev)}
      >
        {isMenuOpen ? "×" : "☰"}
      </button>

      {shouldShowTableInfo && (
        <TableInfo onClose={() => setShouldShowTableInfo(false)} />
      )}
      {shouldShowShareTable && (
        <ShareTable
          table={playingTable!}
          onClose={() => setShouldShowShareTable(false)}
        />
      )}
      {shouldShowHowToPlay && (
        <HowToPlay onClose={() => setShouldShowHowToPlay(false)} />
      )}
      <TableChat
        isOpen={shouldShowChat}
        onOpen={() => setShouldShowChat(true)}
        onClose={() => setShouldShowChat(false)}
      />
    </>
  );
};

export default PlayerMenu;
```

- [ ] **Step 7: Simplify `GamePlayer.tsx` imports**

Replace:

```tsx
import Cards from "../Cards/Cards";
import PlayerInfo from "./PlayerInfo";
import TableInfo from "../Tables/TableInfo";
import ShareTable from "../Tables/ShareTable";
import HowToPlay from "./HowToPlay";
import TableChat from "./TableChat";
```

with:

```tsx
import Cards from "../Cards/Cards";
import PlayerInfo from "./PlayerInfo";
import PlayerMenu from "./PlayerMenu";
```

- [ ] **Step 8: Remove the three modal open-state hooks from `GamePlayer`**

Delete:

```tsx
  const [shouldShowTableInfo, setShouldShowTableInfo] = useState(false);
  const [shouldShowHowToPlay, setShouldShowHowToPlay] = useState(false);
  const [shouldShowShareTable, setShouldShowShareTable] = useState(false);
```

(`useState` is still used by the tiger/sorting state below, so keep the import.)

- [ ] **Step 9: Replace the icon column with `<PlayerMenu />`**

In `GamePlayer.tsx`, replace:

```tsx
          {isMe && (
            <div className="flex flex-col">
              <button
                className="!p-0"
                onClick={() => setShouldShowTableInfo(true)}
              >
                ℹ️
              </button>
              {shouldShowTableInfo && (
                <TableInfo onClose={() => setShouldShowTableInfo(false)} />
              )}
              <button
                className="!p-0"
                title={t("table.share")}
                aria-label={t("table.share")}
                onClick={() => setShouldShowShareTable(true)}
              >
                🔗
              </button>
              {shouldShowShareTable && (
                <ShareTable
                  table={playingTable!}
                  onClose={() => setShouldShowShareTable(false)}
                />
              )}
              <button
                className="!p-0"
                onClick={() => setShouldShowHowToPlay(true)}
              >
                🙋‍♂️
              </button>
              {shouldShowHowToPlay && (
                <HowToPlay onClose={() => setShouldShowHowToPlay(false)} />
              )}
              <TableChat />
            </div>
          )}
```

with:

```tsx
          {isMe && <PlayerMenu />}
```

- [ ] **Step 10: Confirm no dangling references in `GamePlayer`**

Run: `rg "TableInfo|ShareTable|HowToPlay|TableChat|shouldShow" src/components/GamePlayer/GamePlayer.tsx`
Expected: no output.

- [ ] **Step 11: Verify build**

Run: `npm run build`
Expected: PASS (`tsc -b` + `vite build` complete; no unused-import or missing-prop errors).

- [ ] **Step 12: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/components/GamePlayer/GamePlayer.tsx src/components/GamePlayer/PlayerMenu.tsx src/components/GamePlayer/TableChat.tsx
git commit -m "refactor: replace player button column with action FAB"
```

---

### Task 3: Manual verification

**Files:** none (runtime check).

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open the LAN URL on a phone (or use browser device emulation with a narrow viewport).

- [ ] **Step 2: Exercise the flow**

Confirm all of:
- The four-icon column is gone; the hand is wider.
- A round `☰` FAB sits bottom-right.
- Tapping the FAB opens four rows with emoji + text (`Thông tin bàn`, `Chia sẻ`, `Hướng dẫn chơi`, `Trò chuyện`); `☰` becomes `×`.
- Each row opens its corresponding modal/panel and closes the menu.
- Tapping outside the menu and pressing Escape both close the menu.
- `🔙` still leaves the table.
- A message sent from a second client raises the 4-second toast while the chat panel is closed; tapping the toast opens chat.

- [ ] **Step 3: Report**

No code change expected; if a defect is found, fix it, re-run Task 2's build + lint, and commit the fix.

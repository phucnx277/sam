# Local-player action FAB (replace button column)

Date: 2026-10-08
Status: approved (autonomous flow)

## Problem

The local player's `GamePlayer` renders a vertical column of four icon-only
buttons (`ℹ️` table info, `🔗` share, `🙋‍♂️` how-to-play, `💬` chat) to the right
of the hand. Those buttons:

- consume horizontal space that the hand needs, especially on small screens;
- are tiny (`!p-0` bare emoji) and hard to tap on phones, even though the table
  is often played on a phone in rotated-landscape.

We want a single, large, easy-to-tap entry point that reveals the same four
actions with both an emoji and a text label.

## Decisions

- **All screen sizes.** One consistent layout; remove the icon column entirely
  (not mobile-only).
- **Popover menu above the FAB.** Tapping the FAB opens a short vertical list of
  rows (emoji + localized text). Keeps the table visible behind the menu.
- **`🔙` stays where it is.** The back-to-lobby action remains inline to the
  left of the hand; it is not moved into the menu.
- **FAB icon:** `☰` when closed, `×` when open. `title`/`aria-label` from
  `t("game.menu")`, with `aria-expanded`.

## Approaches considered

- **A (chosen). New self-contained `PlayerMenu.tsx`.** Owns the FAB, the popover,
  and all four modal open-states, so `GamePlayer` shrinks back to layout + hand
  concerns. `TableChat` becomes a controlled panel. Best separation of concerns
  and the smallest change to `GamePlayer`.
- B. Keep the four state/`useState`s in `GamePlayer` and only swap the rendered
  markup. Less new code, but leaves the modal plumbing and imported modals in
  `GamePlayer`, which is already the busiest component.
- C. Pure-CSS collapse (a `<details>`/checkbox hamburger). No new component, but
  poor outside-click/Escape handling and no accessible expanded state. Rejected.

## Design

### New `src/components/GamePlayer/PlayerMenu.tsx`

Rendered by `GamePlayer` only when `isMe`. Self-contained: pulls `playingTable`
from `useAppData`, `t` from `useI18n`.

State:

```ts
const [isMenuOpen, setIsMenuOpen] = useState(false);
const [shouldShowTableInfo, setShouldShowTableInfo] = useState(false);
const [shouldShowShareTable, setShouldShowShareTable] = useState(false);
const [shouldShowHowToPlay, setShouldShowHowToPlay] = useState(false);
const [shouldShowChat, setShouldShowChat] = useState(false);
const [shouldShowSettings, setShouldShowSettings] = useState(false);
```

Render tree (fragment):

- **Menu backdrop** (only when `isMenuOpen`): `fixed inset-0 z-[4]`, transparent
  with `backdrop-blur-[2px]`, `aria-hidden="true"`, `onClick` closes the menu.
- **Menu list** (only when `isMenuOpen`): `fixed z-[6]` anchored above the FAB,
  white rounded card (`p-3 gap-y-2`) + shadow, one row per action. Each row is a
  button `flex items-center gap-x-1 !px-2 !py-0 rounded-sm text-left
  hover:bg-cyan-100` containing `<span>{emoji}</span><span>{label}</span>`.
  Clicking a row sets the matching modal state `true` and closes the menu.
  - `ℹ️` + `t("game.tableInfo")`
  - `🔗` + `t("table.share")`
  - `💬` + `t("chat.open")`
  - `🙋‍♂️` + `t("howToPlay.title")`
  - `⚙️` + `t("settings.title")`
- **FAB button:** round (`rounded-full size-8`), filled cyan, white `text-lg`,
  shadow. `title`/`aria-label` `t("game.menu")`, `aria-controls="player-menu"`,
  `aria-expanded={isMenuOpen}`. Toggles `isMenuOpen`. It is **in-flow** as the
  third box of the local player's hand row (see positioning below), not fixed.
- **Modals**, rendered independently of `isMenuOpen`:
  - `<TableInfo onClose={...} />` when `shouldShowTableInfo`
  - `<ShareTable table={playingTable!} onClose={...} />` when `shouldShowShareTable`
  - `<HowToPlay onClose={...} />` when `shouldShowHowToPlay`
  - `<Settings onClose={...} />` when `shouldShowSettings` (language switcher)
  - `<TableChat isOpen={shouldShowChat} onClose={() => setShouldShowChat(false)} />`
    (always mounted, so the incoming-message toast still works while closed)

Layout: `PlayerMenu` renders a `relative flex w-8 shrink-0 items-center
justify-center` wrapper, placed as the third box of the local player's hand row
`[back + lock] [cards] [menu]`. The cards (`flex-1`) are therefore centred
between two equal-width (`w-8`) side boxes. The popover is `absolute z-[6]
bottom-full right-0 mb-1 w-max` relative to that wrapper (opens upward, sized to
its content with `whitespace-nowrap` rows), and the dismiss backdrop stays
`fixed inset-0 z-[4]`. Because the popover/modals live
inside the transformed `.playing-table`, they inherit its rotated coordinate
space, consistent with the existing modals in portrait mobile.

z-index note: menu `z-[6]` sits *below* the existing modals (`z-10`) and toast
(`z-20`) so an opened modal covers it.

Accessibility: the FAB is a plain toggle and the list is a set of buttons — a
**disclosure pattern** (`aria-expanded` + `aria-controls="player-menu"`), not an
ARIA `role="menu"`, because no roving-focus/arrow-key behavior is implemented.

Escape key: a `keydown` listener (added while `isMenuOpen`) closes the menu.

### `src/components/GamePlayer/TableChat.tsx` (refactor)

- Remove the inline `💬` button and the internal `isOpen` state.
- New props: `{ isOpen: boolean; onOpen: () => void; onClose: () => void }`.
- Replace every `setIsOpen(false)` with `onClose()`; replace `setIsOpen(true)`
  (toast click) with `onOpen()`.
- The `useEffect`s that reference `isOpen` and the toast logic are unchanged
  otherwise. Component stays mounted by `PlayerMenu`.

### `src/components/GamePlayer/GamePlayer.tsx` (simplify)

- Delete the `isMe && <div className="flex flex-col">…</div>` icon column.
- Delete now-unused state (`shouldShowTableInfo`, `shouldShowHowToPlay`,
  `shouldShowShareTable`) and imports (`TableInfo`, `ShareTable`, `HowToPlay`,
  `TableChat`).
- Render `<PlayerMenu />` inside the `isMe` branch (e.g. where the column was).
- `t` remains used (`backToLobby`), so `useI18n` stays.

### i18n (`src/locales/vi.ts`, `src/locales/en.ts`)

Add:

- `game.menu` — "Tùy chọn" / "Options"
- `game.tableInfo` — "Thông tin bàn" / "Table info"
- `settings.title` — "Cài đặt" / "Settings"

Reuse existing keys for the other rows: `table.share`, `howToPlay.title`,
`chat.open`.

Update `howToPlay.gestures.buttons1` to describe the FAB, e.g.:
"🔙 rời bàn. Nút ☰ mở menu: ℹ️ thông tin bàn, 🔗 chia sẻ bàn, 💬 trò chuyện,
🙋‍♂️ hướng dẫn chơi, ⚙️ cài đặt." (and the English equivalent).

### `src/components/Tables/TableInfo.tsx`

The language dropdown (`LanguageSwitcher`) is removed from the table-info
header; language is now configured from the FAB's **Settings** modal. The lobby
still exposes `LanguageSwitcher` via `TopRightBar`.

## Verification

- `npm run build` passes (type-checks the new component, `TableChat` props,
  en/vi key parity, no unused imports in `GamePlayer`).
- `npm run lint` passes.
- Manual: FAB shows bottom-right; tapping it opens the 4 labelled rows; tapping
  a row closes the menu and opens the matching modal; tapping outside / Escape
  closes the menu; incoming chat messages still toast while the chat panel is
  closed; works in portrait-rotated mobile and on desktop.

## Out of scope

- No change to the `🔙` back-to-lobby button or its position.
- No animation/transition work beyond the shown/hidden states.
- No change to the modals themselves (`TableInfo`, `ShareTable`, `HowToPlay`).
- No new test framework; verification is build + lint + manual review.

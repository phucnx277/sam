# Ably Lobby: Show Only Your Tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Ably mode, the lobby shows a user only the tables they created or actively joined, while admins see every table and invite links/QR still resolve hidden tables.

**Architecture:** A pure `visibleTables(tables, player)` selector in `src/logic/table.ts` filters the render list. The `tables` store is left untouched (still holds all tables), so deep-link/QR resolution via `getTables()` keeps working and no store/Ably wiring changes. Filtering is applied at render in `Tables.tsx` and for the create-limit guard in `NewTable.tsx`.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4. No test framework — verify with `npm run build` (`tsc -b`) and `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-10-02-ably-lobby-visible-tables-design.md`

---

## File Structure

- `src/logic/table.ts` — add `isTableMember` and `visibleTables` (pure, framework-free).
- `src/components/Tables/Tables.tsx` — import the selector, derive `visible`, use it for the list and counts. Deep-link/`getTables()` paths stay unfiltered.
- `src/components/Tables/NewTable.tsx` — use the visible count for its `TABLE_LIMIT` guard.

No other files change. No store, Ably, peer, i18n, or type changes.

---

### Task 1: Add the `visibleTables` selector to `logic/table.ts`

**Files:**
- Modify: `src/logic/table.ts` (insert after `addTablePlayer`, before `resetSession`)

- [ ] **Step 1: Add the membership helpers**

In `src/logic/table.ts`, immediately after the closing `};` of `addTablePlayer` (the function ending around line 155) and before `export const resetSession`, insert:

```ts
export const isTableMember = (table: Table, player: Player): boolean =>
  table.hostId === player.id ||
  table.players.some((item) => item.id === player.id && !item.isRemoved);

export const visibleTables = (
  tables: Table[],
  player: Player | null,
): Table[] =>
  !player || player.isAdmin
    ? tables
    : tables.filter((table) => isTableMember(table, player));
```

`TablePlayer.isRemoved` is optional, so only `=== true` means removed; the `!item.isRemoved` check keeps every non-removed entry.

- [ ] **Step 2: Verify the types compile**

Run: `npm run build`
Expected: exits 0; `tsc -b` reports no errors. (The helpers are not yet referenced, but this confirms the signatures against `Table`/`Player` in `src/type.d.ts`.)

---

### Task 2: Filter the lobby list in `Tables.tsx`

**Files:**
- Modify: `src/components/Tables/Tables.tsx:5` (import)
- Modify: `src/components/Tables/Tables.tsx:29` (derive selector)
- Modify: `src/components/Tables/Tables.tsx:215,217,228` (use `visible`)

- [ ] **Step 1: Import the selector**

Replace the import at `src/components/Tables/Tables.tsx:5`:

```ts
import { TABLE_LIMIT } from "@logic/table";
```

with:

```ts
import { TABLE_LIMIT, visibleTables } from "@logic/table";
```

- [ ] **Step 2: Derive the visible list**

After `const { localPlayer } = useLocalPlayer();` (line 29), add:

```ts
  const visible = visibleTables(tables, localPlayer);
```

- [ ] **Step 3: Use the visible list for the heading and create button**

Replace the heading expression (line 215):

```tsx
                {t(tables.length > 0 ? "lobby.selectTable" : "lobby.noTable")}
```

with:

```tsx
                {t(visible.length > 0 ? "lobby.selectTable" : "lobby.noTable")}
```

Replace the create-button condition (line 217):

```tsx
              {tables.length < TABLE_LIMIT && (
```

with:

```tsx
              {visible.length < TABLE_LIMIT && (
```

- [ ] **Step 4: Render the visible list**

Replace the list map (line 228):

```tsx
              {tables.map((item) => (
```

with:

```tsx
              {visible.map((item) => (
```

- [ ] **Step 5: Leave the deep-link paths unfiltered**

Confirm the two Ably deep-link lookups still read the unfiltered store — do **not** change them:
- `Tables.tsx:100` — `getTables().find((item) => item.id === parsed.tableId)`
- `Tables.tsx:156` — `tables.find((item) => item.id === parsed.tableId)`

This keeps invite links/QR able to open a hidden table via `EnterTable`.

---

### Task 3: Use the visible count for the create-limit guard in `NewTable.tsx`

**Files:**
- Modify: `src/components/Tables/NewTable.tsx:5` (import)
- Modify: `src/components/Tables/NewTable.tsx:63` (guard)

- [ ] **Step 1: Import the selector**

Replace the import at `src/components/Tables/NewTable.tsx:5`:

```ts
import type { NewTableParams } from "@logic/table";
```

with:

```ts
import { visibleTables, type NewTableParams } from "@logic/table";
```

- [ ] **Step 2: Use the visible count in the guard**

In `NewTable.tsx`, `localPlayer` is already in scope from `useLocalPlayer()` (line 35) and `tables` from `useAppData()` (line 36). Replace the guard at line 63:

```ts
    if (tables.length >= props.limit) {
```

with:

```ts
    if (visibleTables(tables, localPlayer).length >= props.limit) {
```

The rest of the function (the `alert(t("error.tableLimit", ...))` and `return`) is unchanged.

---

### Task 4: Verify and commit

**Files:**
- Verify only; no content changes.

- [ ] **Step 1: Run the build (this is the typecheck)**

Run: `npm run build`
Expected: exits 0; `tsc -b` reports no errors and Vite emits the build.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: exits 0 with no errors.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, open the app in two browser profiles that share the same Ably key, and sign in as two different players (one admin via the `name@playerId@admin` pattern, one plain).

Expected:
- A non-admin sees only tables they created or are currently in.
- A table they are not in does not appear, but pasting its invite link / scanning its QR still opens `EnterTable` and, once entered, the table appears in their lobby.
- The admin sees all tables.
- A new player with no tables sees `lobby.noTable` and the create button.
- Create 10 tables as a non-admin: the create button disappears and `NewTable` refuses an 11th with the table-limit alert.

- [ ] **Step 4: Commit**

```bash
git add src/logic/table.ts src/components/Tables/Tables.tsx src/components/Tables/NewTable.tsx
git commit -m "feat: show only the user's tables in the Ably lobby"
```

Note: the pre-commit hook runs `npm run build` and bumps the patch version in `package.json`; commits are slow by design. Do not use `--no-verify` (this is a code change).

---

## Self-Review

- **Spec coverage:** membership `isTableMember`, admin bypass, and null-player fallback (Task 1); render list + counts via `visible` (Task 2); create-limit uses visible count (Task 3); deep links untouched (Task 2 Step 5); verification (Task 4). All spec sections covered.
- **Placeholder scan:** none — every change shows the exact before/after code.
- **Type consistency:** `visibleTables(tables, player)` and `isTableMember(table, player)` signature and names match Task 1 in the Task 2/3 call sites; `localPlayer` and `tables` are already in scope in both components.

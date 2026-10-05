# Move the "Indirect connection" badge into TableInfo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the amber "Indirect connection" (`game.fallbackMode`) badge from the `PlayingTable` game overlay into `TableInfo`.

**Architecture:** Pure UI relocation. `PlayingTable` stops rendering the badge; `TableInfo` renders it (conditioned on `isPeerFallback`) under its header row. No logic changes.

**Tech Stack:** React 19, Tailwind v4, i18n via `useI18n`. Verification: `npm run build` and `npm run lint`. No test framework — do not add tests.

---

### Task 1: Relocate the badge

**Files:**
- Modify: `src/components/Tables/PlayingTable.tsx`
- Modify: `src/components/Tables/TableInfo.tsx`

- [ ] **Step 1: Remove the badge and destructure from `PlayingTable.tsx`**

Change line 15:

```tsx
  const { playingTable, updateTable, isPeerFallback } = useAppData();
```

to:

```tsx
  const { playingTable, updateTable } = useAppData();
```

Delete lines 41-45:

```tsx
      {isPeerFallback && (
        <div className="fixed top-2 left-2 z-20 px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900">
          {t("game.fallbackMode")}
        </div>
      )}
```

- [ ] **Step 2: Add the badge to `TableInfo.tsx`**

Change the destructure (lines 11-12):

```tsx
  const { playingTable, getApiKey, updateTable, isUpdatingTable, mode } =
    useAppData();
```

to:

```tsx
  const {
    playingTable,
    getApiKey,
    updateTable,
    isUpdatingTable,
    isPeerFallback,
    mode,
  } = useAppData();
```

Insert immediately after the header row's closing `</div>` (after line 138,
before the `table.hostLabel` `<div>`):

```tsx
        {isPeerFallback && (
          <div className="self-start px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900">
            {t("game.fallbackMode")}
          </div>
        )}
```

- [ ] **Step 3: Build and lint**

Run: `npm run build` — expected success.
Run: `npm run lint` — expected exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Tables/PlayingTable.tsx src/components/Tables/TableInfo.tsx
git commit -m "refactor: move Indirect connection badge from game overlay into TableInfo"
```

(The pre-commit hook runs the build, bumps the patch version, runs `npm install`,
and `git add -u`; expected.)

- [ ] **Step 5: Manual verification**

On an Ably-fallback table, open the ℹ️ info modal: the amber "Indirect
connection" pill appears under the table name; the in-game overlay no longer
shows it. On a healthy PeerJS table, no pill appears.

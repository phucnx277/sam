# Host Reconnection During/After Failover — Implementation Plan

> **For agentic workers:** Execute autonomously (AGENTS.md overrides): no review
> gate, work on the current branch, commit as you go. Run `npm run build` and
> `npm run lint` before claiming done.

**Goal:** Abort an open election (with a banner) when the original host returns,
and let a non-removed old host resume playing after a new host is elected.

**Spec:** `docs/superpowers/specs/2026-10-03-host-failover-reconnect-design.md`

---

## Task 1: `isRemoved` data model + removal

**Files:** `src/type.d.ts`, `src/logic/game.ts`

1. Add `isRemoved?: boolean;` to `GamePlayer` (after `isDisconnected`).
2. In `removeDisconnected.handleAction`, set `isRemoved: true` alongside
   `isAway: true`, `isDisconnected: false`, `cards: []`, `selectedCards: []`.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 2: Old host treated as a normal disconnected player

**File:** `src/logic/table.ts`

1. `promoteHost`: change the old host mapping from `{ ...gp, isAway: true }` to
   `{ ...gp, isDisconnected: true }`. Leave cards/chips/`isReady` untouched.
   Keep the existing "advance current player if it is no longer active" block.
2. `applyRejoin`: clear `isDisconnected`; set `isAway = !!gp.isRemoved`:

```ts
export const applyRejoin = (table: Table, playerId: string): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp) return table;
  const nextAway = !!gp.isRemoved;
  if (!gp.isDisconnected && !!gp.isAway === nextAway) return table;
  return {
    ...table,
    game: {
      ...table.game,
      players: table.game.players.map((item) =>
        item.id === playerId
          ? { ...item, isDisconnected: false, isAway: nextAway }
          : item,
      ),
    },
    updatedAt: Date.now(),
  };
};
```

**Verify:** `npm run build`, `npm run lint`.

---

## Task 3: Election-abort notice in `usePeerData`

**File:** `src/hooks/usePeerData.ts`

1. Import `type TranslationKey` from `@logic/i18n`.
2. Module state: `let noticeTimer: number | null = null;` and clear it in
   `clearTimers`.
3. State/additions on `PeerDataState`: `notice: TranslationKey | null;` and
   `clearNotice: () => void;` (initial `notice: null`).
4. Helper:
```ts
const notify = (key: TranslationKey): void => {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  set({ notice: key });
  noticeTimer = window.setTimeout(() => {
    noticeTimer = null;
    set({ notice: null });
  }, 6000);
};
```
5. In `joinHost`'s `conn.on("open")`: before `endElection()`, read
   `const aborted = !!get().election?.active;`; after `endElection()` call
   `if (aborted) notify("hostElection.hostReturned");`.
6. In the client `snapshot` branch: if an election is active **and**
   `msg.table.hostId === get().election?.hostId`, call `endElection()` and
   `notify("hostElection.hostReturned")` before applying the snapshot.
7. Add `clearNotice: () => { if (noticeTimer !== null) { window.clearTimeout(noticeTimer); noticeTimer = null; } set({ notice: null }); }` to the store, and reset `notice: null` in `stop()`.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 4: Expose + render the banner

**Files:** `src/hooks/useAppData.ts`, `src/components/Tables/PlayingTable.tsx`

1. `useAppData`: select `notice` and `clearNotice` from `usePeerData`, add both
   to the returned object and its type.
2. `PlayingTable`: if `notice`, render a dismissible banner near the
   `isPeerFallback` banner:
```tsx
{notice && (
  <div className="fixed top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 text-sm rounded-sm bg-amber-200 text-amber-900 flex items-center gap-2">
    <span>{t(notice)}</span>
    <button type="button" className="!p-0" onClick={clearNotice}>×</button>
  </div>
)}
```

**Verify:** `npm run build`, `npm run lint`.

---

## Task 5: i18n

**Files:** `src/locales/vi.ts`, `src/locales/en.ts`

- vi: `"hostElection.hostReturned": "Chủ bàn đã kết nối lại — đã hủy bầu chủ bàn mới"`
- en: `"hostElection.hostReturned": "Host reconnected — new host election cancelled"`

**Verify:** `npm run build` (en must satisfy the same key set).

---

## Task 6: Final verification

1. `npm run build` — PASS.
2. `npm run lint` — PASS.
3. Manual, 3 browsers (host + 2 clients, game in progress):
   - Kill host, wait for the election overlay, reopen host before a winner →
     overlay closes and the "Host reconnected" banner shows; game continues.
   - Kill host, let a new host be elected, reopen host without removing it →
     old host resumes its seat/hand.
   - Same, but the new host clicks "Remove from game" on the old host → old host
     becomes "Watching" and cannot resume.

# Old Host After Failover — Implementation Plan

> **For agentic workers:** Execute autonomously (AGENTS.md overrides): no review
> gate, work on the current branch, commit as you go. Run `npm run build` and
> `npm run lint` before claiming done.

**Goal:** Let a non-removed old host resume playing after a new host is elected,
while the new host may explicitly remove it.

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

## Task 3: Final verification

1. `npm run build` — PASS.
2. `npm run lint` — PASS.
3. Manual, 3 browsers (host + 2 clients, game in progress):
   - Kill host, let a new host be elected, reopen host without removing it →
     old host resumes its seat/hand.
   - Same, but the new host clicks "Remove from game" on the old host → old host
     becomes "Watching" and cannot resume.

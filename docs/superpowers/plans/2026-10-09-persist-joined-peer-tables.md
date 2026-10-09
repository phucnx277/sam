# Persist Joined Peer Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In peer mode, persist a table to `sam.tables` whenever the local player is a member (host or joined player), so a non-host who backs out sees it in the lobby list and can rejoin.

**Architecture:** Single-point change in `setPlayingTable` (`src/hooks/useAppData.ts`). Swap the peer host-only predicate for the existing `isTableMember` helper so the current upsert + `savePeerTables` path runs for non-host members too. No new files, no new state, no transport changes.

**Tech Stack:** React 19, TypeScript, Zustand, Vite. No test framework (do not invent `npm test`); verification is `npm run build` + `npm run lint`.

---

### Task 1: Persist member peer tables in `setPlayingTable`

**Files:**
- Modify: `src/hooks/useAppData.ts` (import block ~line 14-21; `setPlayingTable` ~line 172-189)

- [ ] **Step 1: Add the `isTableMember` import**

In `src/hooks/useAppData.ts`, the import from `@logic/table` currently reads:

```ts
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
```

Add `isTableMember` to it:

```ts
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  isTableMember,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
```

- [ ] **Step 2: Replace the host-only predicate with a membership predicate**

In `setPlayingTable`, replace this block:

```ts
  setPlayingTable: (data: Table) => {
    set((state) => {
      const localPlayer = useLocalPlayer.getState().localPlayer;
      const isHosted =
        state.mode !== "peer" || data.hostId === localPlayer?.id;
      if (!isHosted) {
        return { playingTable: data };
      }
      const tables = state.tables.some((item) => item.id === data.id)
        ? state.tables.map((item) => (item.id === data.id ? data : item))
        : [...state.tables, data];
      return { playingTable: data, tables };
    });
    if (get().mode === "peer") {
      savePeerTables(get().tables);
    }
    return null;
  },
```

with:

```ts
  setPlayingTable: (data: Table) => {
    set((state) => {
      const localPlayer = useLocalPlayer.getState().localPlayer;
      const isMember =
        state.mode !== "peer" || isTableMember(data, localPlayer!);
      if (!isMember) {
        return { playingTable: data };
      }
      const tables = state.tables.some((item) => item.id === data.id)
        ? state.tables.map((item) => (item.id === data.id ? data : item))
        : [...state.tables, data];
      return { playingTable: data, tables };
    });
    if (get().mode === "peer") {
      savePeerTables(get().tables);
    }
    return null;
  },
```

`isTableMember` is defined in `src/logic/table.ts:157` as `table.hostId === player.id || table.players.some((item) => item.id === player.id && !item.isRemoved)`. The `localPlayer!` non-null assertion is safe because the prior code already dereferenced `localPlayer?.id` and the caller only reaches here once a player is initialized.

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: `tsc -b` reports no errors and `vite build` completes successfully.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "fix: persist joined peer tables for non-host players"
```

(The pre-commit hook runs the build and bumps the patch version; that is expected.)

---

### Task 2: Manual end-to-end verification

No code changes. Verify the behavior with two peer clients (two browser profiles/devices on the LAN via `npm run dev`).

- [ ] **Step 1: Non-host joins and backs out**

Client A hosts a table (peer mode). Client B joins it (scan/paste the link or enter the table id + password). Client B confirms play, then presses 🔙 and confirms leave.

Expected: after the reload, Client B's lobby lists Client A's table; clicking it re-enters (auto-join, since B is still a stored member).

- [ ] **Step 2: Non-member is not persisted**

On a fresh Client C (peer mode) that has only seen the table via a link but never joined, do not join.

Expected: Client C's `sam.tables` does not gain the table; the lobby list stays empty.

- [ ] **Step 3: Host behavior unchanged**

Client A hosts, backs out.

Expected: Client A's table remains listed and rejoinable exactly as before.

# Peer Election Mesh Robustness — Implementation Plan

> **For agentic workers:** Execute autonomously (AGENTS.md overrides): no review
> gate, work on the current branch, commit as you go. Run `npm run build` and
> `npm run lint` before claiming done.

**Goal:** Make both remaining clients detect host loss and join the election
mesh, and stop election rounds from desyncing after a reload.

**Spec:** `docs/superpowers/specs/2026-10-03-peer-election-mesh-robustness-design.md`

---

## Task 1: Client-side host watchdog

**File:** `src/hooks/usePeerData.ts`

1. Add module state `hostWatchdogTimer: number | null` and `lastHostPing: number`,
   plus `clearHostWatchdog()`; clear both in `clearTimers`.
2. In `connectToHost`: clear the watchdog and reset `lastHostPing` at the top; set
   `lastHostPing = Date.now()` in `conn.on("open")` and in the `ping` branch.
3. After `conn.on("close"/"error", onDrop)`, start an interval that, while the
   connection is still the current `hostConn`, calls `onDrop()` once
   `Date.now() - lastHostPing > HEARTBEAT_TIMEOUT_MS`. Clear it in `onDrop`.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 2: Round convergence

**File:** `src/hooks/usePeerData.ts`

In the `present` branch of `handleElectionMsg`, adopt
`round = Math.max(cur.round, msg.round)`, add the participant if new, reply with
`present` using the converged round, and re-send `selfVote` (if any) with the
converged round.

**Verify:** `npm run build`, `npm run lint`.

---

## Task 3: Final verification

1. `npm run build` — PASS.
2. `npm run lint` — PASS.
3. Manual, 3 browsers: host drops → new host elected → old host rejoins → new
   host drops. Both remaining clients show both non-host candidates and can
   reach unanimity.

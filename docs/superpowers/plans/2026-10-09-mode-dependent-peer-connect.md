# Mode-dependent Peer Connect Timeout & Retries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PeerJS client connect timeout/retry policy depend on whether an Ably fallback exists.

**Architecture:** Add a `hasAblyFallback: boolean` parameter to `joinHost` in the peer lifecycle store. Select timeout/retry constants from that flag. Thread the flag through the self-reconnect path. Callers in `useAppData` pass the flag derived from transport mode.

**Tech Stack:** React 19, TypeScript, Zustand, PeerJS. No test framework — verification is `npm run build` + `npm run lint`.

---

## File Structure

- Modify: `src/hooks/usePeerData.ts` — replace constants, add `hasAblyFallback` param, select policy, thread through reconnect.
- Modify: `src/hooks/useAppData.ts` — pass `hasAblyFallback` at the 4 `joinHost` call sites.

---

### Task 1: Mode-dependent joinHost connect policy

**Files:**
- Modify: `src/hooks/usePeerData.ts:12-14`, `:59-66`, `:272-327`
- Modify: `src/hooks/useAppData.ts:248`, `:418`, `:536`, `:581`

- [ ] **Step 1: Replace the global constants**

In `src/hooks/usePeerData.ts`, replace:

```ts
const HOST_RETRY_MS = 1500;
const CONNECT_TIMEOUT_MS = 3000;
const MAX_PEER_RETRIES = 2;
```

with:

```ts
const HOST_RETRY_MS = 1500;
const ABLY_FALLBACK_TIMEOUT_MS = 3000;
const ABLY_FALLBACK_MAX_RETRIES = 0;
const PEER_ONLY_TIMEOUT_MS = 5000;
const PEER_ONLY_MAX_RETRIES = 3;
```

- [ ] **Step 2: Add `hasAblyFallback` to the `joinHost` signature in the store type**

In the `PeerDataState` type (`src/hooks/usePeerData.ts:59-66`), change the end of the `joinHost` signature from:

```ts
    baseTable?: Table,
    retry?: boolean,
  ) => void;
```

to:

```ts
    baseTable?: Table,
    retry?: boolean,
    hasAblyFallback?: boolean,
  ) => void;
```

- [ ] **Step 3: Update the `joinHost` implementation**

Change the implementation header (`src/hooks/usePeerData.ts:272`) from:

```ts
    joinHost: (tableId, player, password, cb, baseTable, retry = false) => {
```

to:

```ts
    joinHost: (
      tableId,
      player,
      password,
      cb,
      baseTable,
      retry = false,
      hasAblyFallback = false,
    ) => {
```

- [ ] **Step 4: Select the policy and use it in `scheduleReconnect`**

Immediately after `if (!retry) connectAttempt = 0;` (`src/hooks/usePeerData.ts:278`), insert:

```ts
      const maxRetries = hasAblyFallback
        ? ABLY_FALLBACK_MAX_RETRIES
        : PEER_ONLY_MAX_RETRIES;
      const connectTimeoutMs = hasAblyFallback
        ? ABLY_FALLBACK_TIMEOUT_MS
        : PEER_ONLY_TIMEOUT_MS;
```

Change the first line of `scheduleReconnect` (`src/hooks/usePeerData.ts:300`) from:

```ts
        if (connectAttempt >= MAX_PEER_RETRIES) return false;
```

to:

```ts
        if (connectAttempt >= maxRetries) return false;
```

Change the self-reconnect call inside `scheduleReconnect` (`src/hooks/usePeerData.ts:308-315`) to pass the flag:

```ts
          get().joinHost(
            tableId,
            player,
            password,
            cb,
            get().latestTable ?? baseTable,
            true,
            hasAblyFallback,
          );
```

Change the connect-timeout `window.setTimeout` delay (`src/hooks/usePeerData.ts:327`) from `CONNECT_TIMEOUT_MS` to `connectTimeoutMs`:

```ts
      }, connectTimeoutMs);
```

- [ ] **Step 5: Pass `hasAblyFallback` at the four call sites in `useAppData.ts`**

`joinPeerTable` (`src/hooks/useAppData.ts:248`) — peer-only entry point, add `undefined, false`:

```ts
    usePeerData
      .getState()
      .joinHost(tableId, localPlayer, password, bridge, undefined, false, false);
```

`switchToPeerTransport` (`src/hooks/useAppData.ts:418`) — Ably fallback available:

```ts
  } else {
    peer.joinHost(
      table.id,
      localPlayer,
      table.password,
      bridge,
      table,
      false,
      true,
    );
  }
```

`reconcilePeerRole` (`src/hooks/useAppData.ts:536`) — Ably fallback available:

```ts
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    clearTableSubscription();
    peer.joinHost(table.id, localPlayer, table.password, bridge, table, false, true);
  }
```

`startPeerSession` (`src/hooks/useAppData.ts:581`) — pass `true` unless transport mode is peer-only:

```ts
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(
      table.id,
      player,
      password,
      bridge,
      table,
      false,
      useAblyStore.getState().mode !== "peer",
    );
  }
```

- [ ] **Step 6: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: both succeed with no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePeerData.ts src/hooks/useAppData.ts
git commit -m "feat: mode-dependent peer connect timeout and retries"
```

(Note: the pre-commit hook builds and bumps the version automatically.)

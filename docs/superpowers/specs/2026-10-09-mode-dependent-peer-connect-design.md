# Mode-dependent Peer connect timeout and retries

## Problem

The client `joinHost` path uses a single hard-coded connect policy:
`CONNECT_TIMEOUT_MS = 3000` and `MAX_PEER_RETRIES = 2`
(`src/hooks/usePeerData.ts:12-14`). This is wrong for two different situations:

- **Ably mode** (an Ably fallback exists): retrying a failed PeerJS connect
  keeps a joinable table blocked from its Ably fallback. A failed peer attempt
  should give up quickly and fall back.
- **Peer-only mode** (no Ably at all): there is no fallback, so the client
  should wait longer and retry more before reporting the host unreachable.

## Requirements

- **Ably mode** (Ably fallback available): connect timeout **3000 ms**, **0 retries**.
- **Peer-only mode**: connect timeout **5000 ms**, **3 retries**.
- Applies **only** to the client connect path (`joinHost`). The host's
  `unavailable-id` registration retry (`HOST_RETRY_MS`) is unchanged.
- "0 retries" means a single attempt; on timeout the client immediately reports
  fallback.
- "3 retries" means the initial attempt plus up to 3 reconnect attempts; only
  after all are exhausted does the client report fallback.

## Design

Add an explicit `hasAblyFallback: boolean` parameter to `joinHost`. The caller
(`useAppData`) knows the transport mode and passes the flag; `usePeerData` stays
decoupled from the Ably store (no circular import).

New constants replace the single pair:

```ts
const HOST_RETRY_MS = 1500;
const ABLY_FALLBACK_TIMEOUT_MS = 3000;
const ABLY_FALLBACK_MAX_RETRIES = 0;
const PEER_ONLY_TIMEOUT_MS = 5000;
const PEER_ONLY_MAX_RETRIES = 3;
```

Inside `joinHost`, the timeout and max-retry values are selected once from
`hasAblyFallback`, and `scheduleReconnect` captures them. The self-reconnect call
propagates `hasAblyFallback`.

### Call sites (`src/hooks/useAppData.ts`)

`hasAblyFallback = useAblyStore.getState().mode !== "peer"`:

- `joinPeerTable` → `false` (peer-only entry point).
- `switchToPeerTransport` → `true`.
- `startPeerSession` (create/enter table) → `true` (mode is Ably or null;
  peer mode routes through `joinPeerTable`).
- `reconcilePeerRole` → `true`.

## Out of scope

- Host `unavailable-id` retry policy.
- Backoff timing between retries (`HOST_RETRY_MS` unchanged).
- Any change to Ably fallback or sticky transport-switch behavior.

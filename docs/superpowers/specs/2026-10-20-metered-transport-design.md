# Metered P2P DataChannel Transport — Design

Date: 2026-10-20
Status: Approved for planning

## Goal

Replace `peerjs` with `@metered-ca/realtime` (`MeteredPeer` + WebRTC P2P `RTCDataChannel`) as the primary real-time transport for tables (both in Ably mode with fallback and in peer-only mode), authenticated using the publishable key in `import.meta.env.VITE_METERED_PUB_KEY`.

## Decisions

| Decision | Choice |
| --- | --- |
| SDK package | `@metered-ca/realtime` (replaces `peerjs`) |
| Auth | Publishable key via `import.meta.env.VITE_METERED_PUB_KEY` passed as `{ apiKey }` to `MeteredPeer` |
| Channel naming | Deterministic per-table channel `sam-<tableId>` (`tablePeerId(tableId)`) |
| Data plane | WebRTC `RTCDataChannel` opened via `remote.pc.createDataChannel("sam")` on `!remote.polite` (`peer-joined` + `connection-reset`) and received via `remote.on("data-channel")` |
| Topology | Logical host-hub over the channel's peer connections: clients send `hello` on open DataChannels; only the host responds with `snapshot` or `reject` and sequences `update` messages with monotonic `rev` |
| External store contract | `usePeerData` keeps identical method signatures (`startHost`, `joinHost`, `sendUpdate`, `stop`) and `PeerCallbacks` so `useAppData` and UI components require no behavioral changes |
| Fallback & retry policy | Unchanged: Ably mode uses 3000 ms timeout / 0 retries then triggers coordinated table-wide Ably fallback; peer-only mode uses 5000 ms timeout / 3 retries |

## Architecture & Data Flow

### 1. Channel Join & P2P DataChannel Negotiation

1. Both `startHost` and `joinHost` instantiate `new MeteredPeer({ apiKey })` where `apiKey = import.meta.env.VITE_METERED_PUB_KEY ?? ""` and join channel `tablePeerId(tableId)` (`sam-<tableId>`).
2. If `apiKey` is empty, `joinHost` / `startHost` schedules fallback/retry rather than throwing synchronously.
3. On `peer.on("peer-joined", ({ peer: remote }) => ...)`:
   - Both sides listen to `remote.on("data-channel", ({ channel }) => wireChannel(remote.id, channel))`.
   - The impolite side (`if (!remote.polite)`) immediately opens `remote.pc.createDataChannel("sam")` and passes it to `wireChannel(remote.id, channel)`.
   - Both sides listen to `remote.on("connection-reset", () => ...)` and re-create the channel if `!remote.polite`, ensuring DataChannels recover across signalling reconnects.
4. On `peer.on("peer-left", ({ peer: remote }) => ...)`:
   - Any tracked DataChannel for `remote.id` is closed and removed.

### 2. Host-Hub Handshake & Messaging over DataChannels

Because publishable keys assign random UUIDs to each `RemotePeer` (`remote.id`), peers discover the host via the existing `PeerMsg` handshake over open DataChannels:

1. **Serialization**: Messages sent over `RTCDataChannel` are JSON-serialized strings (`JSON.stringify(msg)`). `parsePeerMsg(data: unknown)` accepts either a JSON string or a parsed object.
2. **Client (`role === "client"`)**:
   - Whenever a DataChannel to `remote.id` opens (immediately if `readyState === "open"`, or on `open` event), the client sends `{ type: "hello", playerId: player.id, name: player.name, password }` on that channel.
   - When the client receives `{ type: "snapshot", table, rev }` on `remote.id`'s DataChannel:
     - Records `hostPeerId = remote.id` and `hostConn = dc`.
     - Clears `connectTimer`, resets `connectAttempt = 0`, calls `setFallback(false, cb)`, updates `{ latestTable: msg.table, lastRev: msg.rev }`, and invokes `cb.onSnapshot(msg.table, msg.rev)`.
   - When the client receives `{ type: "reject", reason }`:
     - Stops the session and calls `cb.onReject(reason)`.
   - When the client receives `{ type: "update", table, rev }`:
     - Ignores updates unless they arrive from `hostPeerId` (or `msg.from !== "client"`) and pass `shouldApplyRevision(msg.rev, get().lastRev)`.
   - `sendUpdate(table)` sends `{ type: "update", table, rev: state.lastRev + 1, from: "client" }` only on `hostConn` (the channel for `hostPeerId`).
3. **Host (`role === "host"`)**:
   - When `peer.join(tablePeerId(table.id))` succeeds, calls `setFallback(false, cb)`.
   - When the host receives `{ type: "hello", playerId, name, password }` on `remote.id`'s DataChannel:
     - Runs `validateJoin(latest, joining, msg.password)`.
     - If rejected: sends `{ type: "reject", reason }` to `remote.id`, closes that channel after 250 ms, and removes it from `clientConns`.
     - If valid: adds the channel to `clientConns`, runs `cb.onJoin(joining, latest)`, broadcasts any resulting `update` to all `clientConns`, and sends `{ type: "snapshot", table: latest, rev, from: joining.id }` to `remote.id`.
   - When the host receives `{ type: "update", table, rev, from }` from a client:
     - Increments `rev`, updates `latestTable`, broadcasts `{ type: "update", table: msg.table, rev, from: msg.from }` to all `clientConns`, and calls `cb.onUpdate(msg.table, rev)`.
   - `sendUpdate(table)` increments `rev`, updates `latestTable`, and broadcasts `{ type: "update", table, rev, from: "host" }` to all `clientConns`.

### 3. Timeouts, Reconnects, and Fallback

- **Client connect timeout**: Starts `connectTimer` (`3000 ms` when `hasAblyFallback` is true, `5000 ms` in peer-only mode). If no `snapshot` has been received (`!get().hostConn || get().hostConn.readyState !== "open"`) when the timer fires, runs `scheduleReconnect()` (up to `0` retries in Ably mode, `3` in peer-only mode) or calls `setFallback(true, cb)`.
- **Host channel loss on client**: If the DataChannel for `hostPeerId` closes/errors or `peer-left` fires for `hostPeerId`, clears `hostConn`/`hostPeerId` and starts `connectTimer` (or `scheduleReconnect` / `setFallback(true, cb)`), allowing seamless host transfer or reconnect before falling back.
- **Fatal Metered errors**: On `peer.on("error")` or `peer.join(...)` rejection:
  - Host retries `startHost` after `HOST_RETRY_MS` (`1500 ms`), or reports fallback if `VITE_METERED_PUB_KEY` is missing.
  - Client runs `scheduleReconnect()` or `setFallback(true, cb)`.

## Files Changed

- `package.json` / `package-lock.json` — remove `peerjs`, add `@metered-ca/realtime`.
- `src/vite-env.d.ts` — replace `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` with `VITE_METERED_PUB_KEY`.
- `src/logic/peer.ts` — remove unused `CLIENT_PEER_PREFIX`, allow `parsePeerMsg` to parse JSON strings as well as objects.
- `src/hooks/usePeerData.ts` — replace `Peer` / `DataConnection` from `peerjs` with `MeteredPeer` and `RTCDataChannel` management.
- `AGENTS.md` — update transport documentation to reference Metered (`@metered-ca/realtime`) instead of PeerJS.

## Verification

- `npm run build` (`tsc -b && vite build`) passes cleanly.
- `npm run lint` passes with zero warnings/errors.

# Metered P2P DataChannel Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `peerjs` with `@metered-ca/realtime` (`MeteredPeer` + WebRTC P2P `RTCDataChannel`) using `import.meta.env.VITE_METERED_PUB_KEY`.

**Architecture:** Swap the `peerjs` dependency for `@metered-ca/realtime`, update `ImportMetaEnv` to declare `VITE_METERED_PUB_KEY`, allow `parsePeerMsg` to parse JSON strings from `RTCDataChannel` messages, and rewrite `usePeerData` to join channel `sam-<tableId>` via `MeteredPeer` and exchange host-hub `PeerMsg` frames over reconnect-aware `RTCDataChannel` instances.

**Tech Stack:** React 19, TypeScript, Vite 7, Zustand, `@metered-ca/realtime`. No test framework — verification is `npm run build` + `npm run lint`.

---

## File Structure

- Modify: `package.json` & `package-lock.json` — uninstall `peerjs`, install `@metered-ca/realtime`.
- Modify: `src/vite-env.d.ts` — replace `VITE_PEER_*` with `VITE_METERED_PUB_KEY`.
- Modify: `src/logic/peer.ts` — remove unused `CLIENT_PEER_PREFIX` and parse JSON strings in `parsePeerMsg`.
- Modify: `src/hooks/usePeerData.ts` — replace `Peer` / `DataConnection` with `MeteredPeer` and `RTCDataChannel` management.
- Modify: `AGENTS.md` — update transport documentation from PeerJS to Metered.

---

### Task 1: Replace `peerjs` dependency with `@metered-ca/realtime` and update env types & `peer.ts`

**Files:**
- Modify: `package.json`
- Modify: `src/vite-env.d.ts`
- Modify: `src/logic/peer.ts`

- [ ] **Step 1: Swap npm packages**

Run:
```bash
npm uninstall peerjs && npm install @metered-ca/realtime
```

- [ ] **Step 2: Update `src/vite-env.d.ts`**

Replace the contents of `src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;

interface ImportMetaEnv {
  readonly VITE_METERED_PUB_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Update `src/logic/peer.ts` to support JSON string payloads over `RTCDataChannel`**

In `src/logic/peer.ts`, remove `CLIENT_PEER_PREFIX` and allow `parsePeerMsg` to parse string payloads:

```ts
import type { JoinRejectReason } from "./table";

export const HOST_PEER_PREFIX = "sam";

export const tablePeerId = (tableId: string): string =>
  `${HOST_PEER_PREFIX}-${tableId}`;

export type PeerMsg =
  | { type: "hello"; playerId: string; name: string; password: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string }
  | { type: "reject"; reason: JoinRejectReason };

const isTableLike = (value: unknown): value is Table => {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.hostId !== "string") return false;
  if (typeof t.game !== "object" || t.game === null) return false;
  if (!Array.isArray(t.players)) return false;
  return true;
};

export const parsePeerMsg = (raw: unknown): PeerMsg | null => {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  const from = typeof msg.from === "string" ? msg.from : "";
  switch (msg.type) {
    case "hello":
      if (typeof msg.playerId !== "string" || typeof msg.name !== "string") {
        return null;
      }
      return {
        type: "hello",
        playerId: msg.playerId,
        name: msg.name,
        password: typeof msg.password === "string" ? msg.password : "",
      };
    case "snapshot":
      if (
        !isTableLike(msg.table) ||
        typeof msg.rev !== "number" ||
        !Number.isFinite(msg.rev)
      ) {
        return null;
      }
      return { type: "snapshot", table: msg.table, rev: msg.rev, from };
    case "update":
      if (
        !isTableLike(msg.table) ||
        typeof msg.rev !== "number" ||
        !Number.isFinite(msg.rev)
      ) {
        return null;
      }
      return { type: "update", table: msg.table, rev: msg.rev, from };
    case "reject":
      if (msg.reason !== "password" && msg.reason !== "full") {
        return null;
      }
      return { type: "reject", reason: msg.reason };
    default:
      return null;
  }
};

export const shouldApplyRevision = (
  incoming: number,
  lastRev: number,
): boolean => Number.isFinite(incoming) && incoming > lastRev;
```

---

### Task 2: Replace PeerJS with `MeteredPeer` + `RTCDataChannel` in `src/hooks/usePeerData.ts` and update `AGENTS.md`

**Files:**
- Modify: `src/hooks/usePeerData.ts`
- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite `src/hooks/usePeerData.ts` to use `MeteredPeer` and `RTCDataChannel`**

Replace `src/hooks/usePeerData.ts` with:

```ts
import { create } from "zustand";
import { MeteredPeer, type RemotePeer } from "@metered-ca/realtime";
import {
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";
import { validateJoin, type JoinRejectReason } from "@logic/table";

const DATA_CHANNEL_LABEL = "sam";
const HOST_RETRY_MS = 1500;
const ABLY_FALLBACK_TIMEOUT_MS = 3000;
const ABLY_FALLBACK_MAX_RETRIES = 0;
const PEER_ONLY_TIMEOUT_MS = 5000;
const PEER_ONLY_MAX_RETRIES = 3;

let session = 0;
let connectTimer: number | null = null;
let hostRetryTimer: number | null = null;
let reportedFallback: boolean | null = null;
let connectAttempt = 0;

const clearConnectTimer = (): void => {
  if (connectTimer !== null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }
};

const clearTimers = (): void => {
  clearConnectTimer();
  if (hostRetryTimer !== null) {
    window.clearTimeout(hostRetryTimer);
    hostRetryTimer = null;
  }
};

export type PeerCallbacks = {
  onSnapshot: (table: Table, rev: number) => void;
  onUpdate: (table: Table, rev: number) => void;
  onJoin: (player: Player, table: Table) => Table | null;
  onFallback: (fallback: boolean) => void;
  onReject: (reason: JoinRejectReason) => void;
};

type PeerRole = "host" | "client" | null;

type PeerDataState = {
  peer: MeteredPeer | null;
  role: PeerRole;
  tableId: string | null;
  hostPeerId: string | null;
  hostConn: RTCDataChannel | null;
  clientConns: RTCDataChannel[];
  latestTable: Table | null;
  rev: number;
  lastRev: number;
  fallback: boolean;
  callbacks: PeerCallbacks | null;
  startHost: (table: Table, player: Player, cb: PeerCallbacks) => void;
  joinHost: (
    tableId: string,
    player: Player,
    password: string,
    cb: PeerCallbacks,
    baseTable?: Table,
    retry?: boolean,
    hasAblyFallback?: boolean,
  ) => void;
  sendUpdate: (table: Table) => void;
  stop: () => void;
};

const getMeteredApiKey = (): string =>
  (import.meta.env.VITE_METERED_PUB_KEY ?? "").trim();

const safeSend = (conn: RTCDataChannel, msg: PeerMsg): void => {
  if (conn.readyState !== "open") return;
  try {
    conn.send(JSON.stringify(msg));
  } catch {
    /* connection closed mid-send */
  }
};

const safeCloseChannel = (conn: RTCDataChannel | null | undefined): void => {
  if (!conn) return;
  try {
    conn.onopen = null;
    conn.onmessage = null;
    conn.onclose = null;
    conn.onerror = null;
    conn.close();
  } catch {
    /* noop */
  }
};

const destroyState = (state: PeerDataState): void => {
  safeCloseChannel(state.hostConn);
  state.clientConns.forEach((conn) => safeCloseChannel(conn));
  if (state.peer) {
    try {
      state.peer.close();
    } catch {
      /* noop */
    }
  }
};

const bindPeerDataChannels = (
  peer: MeteredPeer,
  isCurrentSession: () => boolean,
  onChannel: (remote: RemotePeer, dc: RTCDataChannel) => void,
  onRemoteLeft: (remoteId: string) => void,
): void => {
  const peerChannels = new Map<string, RTCDataChannel>();

  const attachChannel = (remote: RemotePeer, raw: RTCDataChannel): void => {
    if (!isCurrentSession()) {
      safeCloseChannel(raw);
      return;
    }
    const prev = peerChannels.get(remote.id);
    if (prev && prev !== raw) {
      safeCloseChannel(prev);
    }
    peerChannels.set(remote.id, raw);
    onChannel(remote, raw);
  };

  const maybeCreateChannel = (remote: RemotePeer): void => {
    if (!isCurrentSession() || remote.polite) return;
    try {
      const dc = remote.pc.createDataChannel(
        DATA_CHANNEL_LABEL,
      ) as unknown as RTCDataChannel;
      attachChannel(remote, dc);
    } catch {
      /* peer connection not ready or closed */
    }
  };

  peer.on("peer-joined", ({ peer: remote }) => {
    if (!isCurrentSession()) return;
    remote.on("data-channel", ({ channel }) => {
      attachChannel(remote, channel as unknown as RTCDataChannel);
    });
    maybeCreateChannel(remote);
    remote.on("connection-reset", () => {
      maybeCreateChannel(remote);
    });
  });

  peer.on("peer-left", ({ peer: remote }) => {
    if (!isCurrentSession()) return;
    const prev = peerChannels.get(remote.id);
    if (prev) {
      safeCloseChannel(prev);
      peerChannels.delete(remote.id);
    }
    onRemoteLeft(remote.id);
  });
};

const usePeerData = create<PeerDataState>((set, get) => {
  const setFallback = (fallback: boolean, cb: PeerCallbacks): void => {
    if (reportedFallback === fallback) return;
    reportedFallback = fallback;
    set({ fallback });
    cb.onFallback(fallback);
  };

  return {
    peer: null,
    role: null,
    tableId: null,
    hostPeerId: null,
    hostConn: null,
    clientConns: [],
    latestTable: null,
    rev: 0,
    lastRev: 0,
    fallback: false,
    callbacks: null,

    startHost: (table, player, cb) => {
      const prev = get();
      session += 1;
      const mySession = session;
      const isCurrentSession = (): boolean => mySession === session;
      clearTimers();
      reportedFallback = null;
      connectAttempt = 0;
      destroyState(prev);
      const baseTable =
        prev.tableId === table.id ? (prev.latestTable ?? table) : table;
      const baseRev = Math.max(prev.rev, prev.lastRev, Date.now());

      const apiKey = getMeteredApiKey();
      if (!apiKey) {
        set({
          peer: null,
          role: "host",
          tableId: table.id,
          hostPeerId: null,
          latestTable: baseTable,
          rev: baseRev,
          lastRev: baseRev,
          fallback: false,
          hostConn: null,
          clientConns: [],
          callbacks: cb,
        });
        setFallback(true, cb);
        return;
      }

      const peer = new MeteredPeer({ apiKey });
      const channelByRemote = new Map<string, RTCDataChannel>();

      set({
        peer,
        role: "host",
        tableId: table.id,
        hostPeerId: null,
        latestTable: baseTable,
        rev: baseRev,
        lastRev: baseRev,
        fallback: false,
        hostConn: null,
        clientConns: [],
        callbacks: cb,
      });

      const removeClientConn = (conn: RTCDataChannel): void => {
        if (!isCurrentSession()) return;
        set({ clientConns: get().clientConns.filter((c) => c !== conn) });
      };

      bindPeerDataChannels(
        peer,
        isCurrentSession,
        (remote, conn) => {
          const prevConn = channelByRemote.get(remote.id);
          if (prevConn && prevConn !== conn) {
            removeClientConn(prevConn);
          }
          channelByRemote.set(remote.id, conn);

          conn.onmessage = (ev: MessageEvent) => {
            if (!isCurrentSession()) return;
            const msg = parsePeerMsg(ev.data);
            if (!msg) return;
            if (msg.type === "hello") {
              const state = get();
              if (!state.clientConns.includes(conn)) {
                set({ clientConns: [...state.clientConns, conn] });
              }
              const joining: Player = { id: msg.playerId, name: msg.name };
              let latest = get().latestTable ?? table;

              const reason = validateJoin(latest, joining, msg.password);
              if (reason) {
                safeSend(conn, { type: "reject", reason });
                window.setTimeout(() => {
                  safeCloseChannel(conn);
                }, 250);
                removeClientConn(conn);
                return;
              }

              const merged = get().callbacks?.onJoin(joining, latest);
              if (merged && merged !== latest) {
                const rev = get().rev + 1;
                set({ latestTable: merged, rev });
                latest = merged;
                const out: PeerMsg = {
                  type: "update",
                  table: merged,
                  rev,
                  from: joining.id,
                };
                get().clientConns.forEach((c) => safeSend(c, out));
                get().callbacks?.onUpdate(merged, rev);
              }
              safeSend(conn, {
                type: "snapshot",
                table: latest,
                rev: get().rev,
                from: joining.id,
              });
              return;
            }
            if (msg.type === "update") {
              const rev = get().rev + 1;
              set({ latestTable: msg.table, rev });
              const out: PeerMsg = {
                type: "update",
                table: msg.table,
                rev,
                from: msg.from,
              };
              get().clientConns.forEach((c) => safeSend(c, out));
              get().callbacks?.onUpdate(msg.table, rev);
            }
          };

          conn.onclose = () => {
            removeClientConn(conn);
          };

          conn.onerror = () => {
            removeClientConn(conn);
          };
        },
        (remoteId) => {
          const prevConn = channelByRemote.get(remoteId);
          if (prevConn) {
            channelByRemote.delete(remoteId);
            removeClientConn(prevConn);
          }
        },
      );

      const scheduleHostRetry = (): void => {
        if (!isCurrentSession() || hostRetryTimer !== null) return;
        hostRetryTimer = window.setTimeout(() => {
          hostRetryTimer = null;
          if (!isCurrentSession()) return;
          const state = get();
          if (state.role === "host" && state.tableId === table.id) {
            state.startHost(state.latestTable ?? table, player, cb);
          }
        }, HOST_RETRY_MS);
      };

      peer.on("error", () => {
        scheduleHostRetry();
      });

      peer
        .join(tablePeerId(table.id))
        .then(() => {
          if (!isCurrentSession()) return;
          setFallback(false, cb);
        })
        .catch(() => {
          scheduleHostRetry();
        });
    },

    joinHost: (
      tableId,
      player,
      password,
      cb,
      baseTable,
      retry = false,
      hasAblyFallback = false,
    ) => {
      const prev = get();
      session += 1;
      const mySession = session;
      const isCurrentSession = (): boolean => mySession === session;
      clearTimers();
      reportedFallback = null;
      if (!retry) connectAttempt = 0;
      const maxRetries = hasAblyFallback
        ? ABLY_FALLBACK_MAX_RETRIES
        : PEER_ONLY_MAX_RETRIES;
      const connectTimeoutMs = hasAblyFallback
        ? ABLY_FALLBACK_TIMEOUT_MS
        : PEER_ONLY_TIMEOUT_MS;
      destroyState(prev);
      const seeded =
        prev.tableId === tableId
          ? (prev.latestTable ?? baseTable ?? null)
          : (baseTable ?? null);

      const apiKey = getMeteredApiKey();
      if (!apiKey) {
        set({
          peer: null,
          role: "client",
          tableId,
          hostPeerId: null,
          latestTable: seeded,
          rev: 0,
          lastRev: 0,
          fallback: false,
          hostConn: null,
          clientConns: [],
          callbacks: cb,
        });
        setFallback(true, cb);
        return;
      }

      const peer = new MeteredPeer({ apiKey });
      set({
        peer,
        role: "client",
        tableId,
        hostPeerId: null,
        latestTable: seeded,
        rev: 0,
        lastRev: 0,
        fallback: false,
        hostConn: null,
        clientConns: [],
        callbacks: cb,
      });

      const scheduleReconnect = (): boolean => {
        if (connectAttempt >= maxRetries) return false;
        connectAttempt += 1;
        if (hostRetryTimer !== null) {
          window.clearTimeout(hostRetryTimer);
        }
        hostRetryTimer = window.setTimeout(() => {
          hostRetryTimer = null;
          if (!isCurrentSession()) return;
          get().joinHost(
            tableId,
            player,
            password,
            cb,
            get().latestTable ?? baseTable,
            true,
            hasAblyFallback,
          );
        }, HOST_RETRY_MS);
        return true;
      };

      const startConnectWait = (): void => {
        clearConnectTimer();
        connectTimer = window.setTimeout(() => {
          connectTimer = null;
          if (!isCurrentSession()) return;
          if (get().hostConn?.readyState === "open") return;
          if (!scheduleReconnect()) {
            setFallback(true, cb);
          }
        }, connectTimeoutMs);
      };

      startConnectWait();

      const handleHostLost = (remoteId: string): void => {
        if (!isCurrentSession()) return;
        if (get().hostPeerId !== remoteId) return;
        set({ hostPeerId: null, hostConn: null });
        startConnectWait();
      };

      bindPeerDataChannels(
        peer,
        isCurrentSession,
        (remote, conn) => {
          const sendHello = (): void => {
            if (!isCurrentSession()) return;
            safeSend(conn, {
              type: "hello",
              playerId: player.id,
              name: player.name,
              password,
            });
          };

          if (conn.readyState === "open") {
            sendHello();
          } else {
            conn.onopen = sendHello;
          }

          conn.onmessage = (ev: MessageEvent) => {
            if (!isCurrentSession()) return;
            const msg = parsePeerMsg(ev.data);
            if (!msg) return;
            if (msg.type === "snapshot") {
              clearConnectTimer();
              connectAttempt = 0;
              set({
                hostPeerId: remote.id,
                hostConn: conn,
                latestTable: msg.table,
                lastRev: msg.rev,
              });
              setFallback(false, cb);
              cb.onSnapshot(msg.table, msg.rev);
              return;
            }
            if (msg.type === "reject") {
              const callbacks = get().callbacks;
              get().stop();
              callbacks?.onReject(msg.reason);
              return;
            }
            if (msg.type === "update") {
              const currentHostPeerId = get().hostPeerId;
              if (currentHostPeerId && remote.id !== currentHostPeerId) return;
              if (msg.from === "client") return;
              if (!shouldApplyRevision(msg.rev, get().lastRev)) return;
              if (!currentHostPeerId) {
                clearConnectTimer();
                connectAttempt = 0;
                set({ hostPeerId: remote.id, hostConn: conn });
                setFallback(false, cb);
              }
              set({ latestTable: msg.table, lastRev: msg.rev });
              cb.onUpdate(msg.table, msg.rev);
            }
          };

          conn.onclose = () => {
            handleHostLost(remote.id);
          };

          conn.onerror = () => {
            handleHostLost(remote.id);
          };
        },
        (remoteId) => {
          handleHostLost(remoteId);
        },
      );

      peer.on("error", () => {
        if (!isCurrentSession()) return;
        clearConnectTimer();
        set({ hostPeerId: null, hostConn: null });
        if (!scheduleReconnect()) {
          setFallback(true, cb);
        }
      });

      peer.join(tablePeerId(tableId)).catch(() => {
        if (!isCurrentSession()) return;
        clearConnectTimer();
        set({ hostPeerId: null, hostConn: null });
        if (!scheduleReconnect()) {
          setFallback(true, cb);
        }
      });
    },

    sendUpdate: (table) => {
      const state = get();
      if (state.role === "host") {
        const rev = state.rev + 1;
        set({ latestTable: table, rev });
        const out: PeerMsg = { type: "update", table, rev, from: "host" };
        state.clientConns.forEach((c) => safeSend(c, out));
        return;
      }
      if (state.role === "client" && state.hostConn) {
        const rev = state.lastRev + 1;
        set({ latestTable: table, lastRev: rev });
        safeSend(state.hostConn, {
          type: "update",
          table,
          rev,
          from: "client",
        });
      }
    },

    stop: () => {
      session += 1;
      clearTimers();
      reportedFallback = null;
      connectAttempt = 0;
      destroyState(get());
      set({
        peer: null,
        role: null,
        tableId: null,
        hostPeerId: null,
        hostConn: null,
        clientConns: [],
        latestTable: null,
        rev: 0,
        lastRev: 0,
        fallback: false,
        callbacks: null,
      });
    },
  };
});

export default usePeerData;
```

- [ ] **Step 2: Update `AGENTS.md` architecture section**

In `AGENTS.md`, update the "Realtime data model" bullet to describe Metered (`@metered-ca/realtime`) instead of PeerJS.

- [ ] **Step 3: Verify build and lint**

Run:
```bash
npm run build && npm run lint
```
Expected: both pass with zero errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/vite-env.d.ts src/logic/peer.ts src/hooks/usePeerData.ts AGENTS.md
git commit -m "feat: replace PeerJS with Metered P2P DataChannel transport"
```

import { create } from "zustand";
import Peer, { type DataConnection } from "peerjs";
import {
  CLIENT_PEER_PREFIX,
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";
import { validateJoin, type JoinRejectReason } from "@logic/table";

const HOST_RETRY_MS = 1500;
const CONNECT_TIMEOUT_MS = 8000;
const MAX_PEER_RETRIES = 4;

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
  peer: Peer | null;
  role: PeerRole;
  tableId: string | null;
  hostConn: DataConnection | null;
  clientConns: DataConnection[];
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
  ) => void;
  sendUpdate: (table: Table) => void;
  stop: () => void;
};

const peerOptions = (): { host?: string; port?: number; path?: string } => {
  const options: { host?: string; port?: number; path?: string } = {};
  if (import.meta.env.VITE_PEER_HOST) {
    options.host = import.meta.env.VITE_PEER_HOST;
  }
  if (import.meta.env.VITE_PEER_PORT) {
    options.port = Number(import.meta.env.VITE_PEER_PORT);
  }
  if (import.meta.env.VITE_PEER_PATH) {
    options.path = import.meta.env.VITE_PEER_PATH;
  }
  return options;
};

export const randomClientPeerId = (): string =>
  `${CLIENT_PEER_PREFIX}-${Math.random().toString(36).slice(2, 10)}`;

const safeSend = (conn: DataConnection, msg: PeerMsg): void => {
  if (!conn.open) return;
  try {
    conn.send(msg);
  } catch {
    /* connection closed mid-send */
  }
};

const destroyState = (state: PeerDataState): void => {
  if (state.hostConn) {
    try {
      state.hostConn.close();
    } catch {
      /* noop */
    }
  }
  state.clientConns.forEach((conn) => {
    try {
      conn.close();
    } catch {
      /* noop */
    }
  });
  if (state.peer) {
    try {
      state.peer.destroy();
    } catch {
      /* noop */
    }
  }
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
      clearTimers();
      reportedFallback = null;
      connectAttempt = 0;
      destroyState(prev);
      const baseTable =
        prev.tableId === table.id ? (prev.latestTable ?? table) : table;
      const baseRev = Math.max(prev.rev, prev.lastRev, Date.now());

      const peer = new Peer(tablePeerId(table.id), peerOptions());
      set({
        peer,
        role: "host",
        tableId: table.id,
        latestTable: baseTable,
        rev: baseRev,
        lastRev: baseRev,
        fallback: false,
        hostConn: null,
        clientConns: [],
        callbacks: cb,
      });

      peer.on("open", () => {
        if (mySession !== session) return;
        setFallback(false, cb);
      });

      peer.on("connection", (conn) => {
        conn.on("data", (data) => {
          if (mySession !== session) return;
          const msg = parsePeerMsg(data);
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
                try {
                  conn.close();
                } catch {
                  /* noop */
                }
              }, 250);
              set({
                clientConns: get().clientConns.filter((c) => c !== conn),
              });
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
        });

        conn.on("close", () => {
          if (mySession !== session) return;
          set({ clientConns: get().clientConns.filter((c) => c !== conn) });
        });

        conn.on("error", () => {
          if (mySession !== session) return;
          set({ clientConns: get().clientConns.filter((c) => c !== conn) });
        });
      });

      peer.on("disconnected", () => {
        if (mySession !== session) return;
        try {
          peer.reconnect();
        } catch {
          /* noop */
        }
      });

      peer.on("error", (err) => {
        if (mySession !== session) return;
        const type = (err as { type?: string }).type;
        if (type !== "unavailable-id") return;
        hostRetryTimer = window.setTimeout(() => {
          hostRetryTimer = null;
          if (mySession !== session) return;
          const state = get();
          if (state.role === "host" && state.tableId === table.id) {
            state.startHost(state.latestTable ?? table, player, cb);
          }
        }, HOST_RETRY_MS);
      });
    },

    joinHost: (tableId, player, password, cb, baseTable) => {
      const prev = get();
      session += 1;
      const mySession = session;
      clearTimers();
      reportedFallback = null;
      destroyState(prev);
      const seeded =
        prev.tableId === tableId
          ? (prev.latestTable ?? baseTable ?? null)
          : (baseTable ?? null);

      const peer = new Peer(randomClientPeerId(), peerOptions());
      set({
        peer,
        role: "client",
        tableId,
        latestTable: seeded,
        rev: 0,
        lastRev: 0,
        fallback: false,
        hostConn: null,
        clientConns: [],
        callbacks: cb,
      });

      const scheduleReconnect = (): boolean => {
        if (connectAttempt >= MAX_PEER_RETRIES) return false;
        connectAttempt += 1;
        if (hostRetryTimer !== null) {
          window.clearTimeout(hostRetryTimer);
        }
        hostRetryTimer = window.setTimeout(() => {
          hostRetryTimer = null;
          if (mySession !== session) return;
          get().joinHost(
            tableId,
            player,
            password,
            cb,
            get().latestTable ?? baseTable,
          );
        }, HOST_RETRY_MS);
        return true;
      };

      connectTimer = window.setTimeout(() => {
        connectTimer = null;
        if (mySession !== session) return;
        if (get().hostConn?.open) return;
        if (!scheduleReconnect()) {
          setFallback(true, cb);
        }
      }, CONNECT_TIMEOUT_MS);

      peer.on("open", () => {
        if (mySession !== session) return;
        const conn = peer.connect(tablePeerId(tableId), { reliable: true });
        set({ hostConn: conn });

        conn.on("open", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          connectAttempt = 0;
          setFallback(false, cb);
          safeSend(conn, {
            type: "hello",
            playerId: player.id,
            name: player.name,
            password,
          });
        });

        conn.on("data", (data) => {
          if (mySession !== session) return;
          const msg = parsePeerMsg(data);
          if (!msg) return;
          if (msg.type === "snapshot") {
            set({ latestTable: msg.table, lastRev: msg.rev });
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
            if (!shouldApplyRevision(msg.rev, get().lastRev)) return;
            set({ latestTable: msg.table, lastRev: msg.rev });
            cb.onUpdate(msg.table, msg.rev);
          }
        });

        conn.on("close", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          set({ hostConn: null });
          if (!scheduleReconnect()) {
            setFallback(true, cb);
          }
        });

        conn.on("error", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          set({ hostConn: null });
          if (!scheduleReconnect()) {
            setFallback(true, cb);
          }
        });
      });

      peer.on("disconnected", () => {
        if (mySession !== session) return;
        try {
          peer.reconnect();
        } catch {
          /* noop */
        }
      });

      peer.on("error", (err) => {
        if (mySession !== session) return;
        clearConnectTimer();
        set({ hostConn: null });
        const type = (err as { type?: string }).type;
        if (type === "unavailable-id" || type === "peer-unavailable") {
          if (!scheduleReconnect()) {
            setFallback(true, cb);
          }
          return;
        }
        setFallback(true, cb);
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

import { create } from "zustand";
import Peer, { type DataConnection } from "peerjs";
import {
  CLIENT_PEER_PREFIX,
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";

const HOST_RETRY_MS = 1500;
const CONNECT_TIMEOUT_MS = 8000;

let session = 0;
let connectTimer: number | null = null;
let hostRetryTimer: number | null = null;

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
  onFallback: (fallback: boolean) => void;
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
  joinHost: (table: Table, player: Player, cb: PeerCallbacks) => void;
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
    if (get().fallback === fallback) return;
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
      destroyState(prev);
      clearTimers();
      session += 1;
      const mySession = session;
      const sameTable = prev.tableId === table.id;
      const baseRev = sameTable ? Math.max(prev.rev, prev.lastRev) : 0;
      const baseTable = sameTable ? (prev.latestTable ?? table) : table;

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
            safeSend(conn, {
              type: "snapshot",
              table: get().latestTable ?? table,
              rev: get().rev,
              from: player.id,
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
          if (mySession !== session) return;
          const state = get();
          if (state.role === "host" && state.tableId === table.id) {
            state.startHost(state.latestTable ?? table, player, cb);
          }
        }, HOST_RETRY_MS);
      });
    },

    joinHost: (table, player, cb) => {
      const prev = get();
      destroyState(prev);
      clearTimers();
      session += 1;
      const mySession = session;
      const sameTable = prev.tableId === table.id;
      const baseTable = sameTable ? (prev.latestTable ?? table) : table;

      const peer = new Peer(randomClientPeerId(), peerOptions());
      set({
        peer,
        role: "client",
        tableId: table.id,
        latestTable: baseTable,
        rev: 0,
        lastRev: 0,
        fallback: false,
        hostConn: null,
        clientConns: [],
        callbacks: cb,
      });

      connectTimer = window.setTimeout(() => {
        if (mySession !== session) return;
        if (!get().hostConn?.open) {
          setFallback(true, cb);
        }
      }, CONNECT_TIMEOUT_MS);

      peer.on("open", () => {
        if (mySession !== session) return;
        const conn = peer.connect(tablePeerId(table.id), { reliable: true });
        set({ hostConn: conn });

        conn.on("open", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          setFallback(false, cb);
          safeSend(conn, {
            type: "hello",
            playerId: player.id,
            name: player.name,
          });
          safeSend(conn, {
            type: "update",
            table: get().latestTable ?? table,
            rev: get().lastRev + 1,
            from: player.id,
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
          setFallback(true, cb);
        });

        conn.on("error", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          set({ hostConn: null });
          setFallback(true, cb);
        });
      });

      peer.on("error", (err) => {
        if (mySession !== session) return;
        clearConnectTimer();
        set({ hostConn: null });
        const type = (err as { type?: string }).type;
        if (type === "unavailable-id") {
          hostRetryTimer = window.setTimeout(() => {
            if (mySession !== session) return;
            get().joinHost(get().latestTable ?? table, player, cb);
          }, HOST_RETRY_MS);
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

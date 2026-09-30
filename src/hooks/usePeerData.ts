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

const usePeerData = create<PeerDataState>((set, get) => ({
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
    destroyState(get());
    const peer = new Peer(tablePeerId(table.id), peerOptions());
    set({
      peer,
      role: "host",
      tableId: table.id,
      latestTable: table,
      rev: 0,
      lastRev: 0,
      fallback: false,
      hostConn: null,
      clientConns: [],
      callbacks: cb,
    });

    peer.on("open", () => cb.onFallback(false));

    peer.on("connection", (conn) => {
      conn.on("data", (data) => {
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
        set({ clientConns: get().clientConns.filter((c) => c !== conn) });
      });

      conn.on("error", () => {
        set({ clientConns: get().clientConns.filter((c) => c !== conn) });
      });
    });

    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {
        /* noop */
      }
    });

    peer.on("error", (err) => {
      const type = (err as { type?: string }).type;
      if (type !== "unavailable-id") return;
      setTimeout(() => {
        const state = get();
        if (state.role === "host" && state.tableId === table.id) {
          state.startHost(state.latestTable ?? table, player, cb);
        }
      }, HOST_RETRY_MS);
    });
  },

  joinHost: (table, player, cb) => {
    destroyState(get());
    const peer = new Peer(randomClientPeerId(), peerOptions());
    set({
      peer,
      role: "client",
      tableId: table.id,
      latestTable: table,
      rev: 0,
      lastRev: 0,
      fallback: false,
      hostConn: null,
      clientConns: [],
      callbacks: cb,
    });

    const timeout = window.setTimeout(() => {
      if (!get().hostConn?.open) {
        set({ fallback: true });
        cb.onFallback(true);
      }
    }, CONNECT_TIMEOUT_MS);

    peer.on("open", () => {
      const conn = peer.connect(tablePeerId(table.id), { reliable: true });
      set({ hostConn: conn });

      conn.on("open", () => {
        window.clearTimeout(timeout);
        set({ fallback: false });
        cb.onFallback(false);
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
        window.clearTimeout(timeout);
        set({ hostConn: null, fallback: true });
        cb.onFallback(true);
      });

      conn.on("error", () => {
        window.clearTimeout(timeout);
        set({ fallback: true });
        cb.onFallback(true);
      });
    });

    peer.on("error", () => {
      window.clearTimeout(timeout);
      set({ fallback: true });
      cb.onFallback(true);
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
      safeSend(state.hostConn, {
        type: "update",
        table,
        rev: state.lastRev + 1,
        from: "client",
      });
    }
  },

  stop: () => {
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
}));

export default usePeerData;

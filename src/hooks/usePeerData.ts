import { create } from "zustand";
import Peer, { type DataConnection } from "peerjs";
import {
  clientPeerId,
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";
import {
  markPlayerDisconnected,
  maskTableFor,
  promoteHost,
  validateJoin,
  type JoinRejectReason,
  type RejoinInfo,
} from "@logic/table";
import useLocalGame from "@hooks/useLocalGame";
import { applyAction, intendedPlayerId, TurnActions } from "@logic/game";

const HOST_RETRY_MS = 1500;
const CONNECT_TIMEOUT_MS = 8000;
const MAX_PEER_RETRIES = 4;
const HOST_GRACE_MS = 10000;
const ELECTION_ROUND_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 4000;
const HEARTBEAT_TIMEOUT_MS = 10000;

let session = 0;
let connectTimer: number | null = null;
let hostRetryTimer: number | null = null;
let reportedFallback: boolean | null = null;
let connectAttempt = 0;
let wasConnected = false;
let signalingAttempt = 0;
let electionRound = 0;
let hostClaimAttempt = 0;
let clientIdRetried = false;
let clientIdSuffix = "";
let graceTimer: number | null = null;
let electionTimer: number | null = null;
let electionConns: Map<string, DataConnection> = new Map();
let heartbeatTimer: number | null = null;
let connLastSeen: Map<DataConnection, number> = new Map();
let hostWatchdogTimer: number | null = null;
let lastHostPing = 0;

const clearHostWatchdog = (): void => {
  if (hostWatchdogTimer !== null) {
    window.clearInterval(hostWatchdogTimer);
    hostWatchdogTimer = null;
  }
};

const clearConnectTimer = (): void => {
  if (connectTimer !== null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }
};

const clearTimers = (): void => {
  clearConnectTimer();
  clearHostWatchdog();
  lastHostPing = 0;
  if (heartbeatTimer !== null) {
    window.clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  connLastSeen = new Map();
  if (hostRetryTimer !== null) {
    window.clearTimeout(hostRetryTimer);
    hostRetryTimer = null;
  }
  if (graceTimer !== null) {
    window.clearTimeout(graceTimer);
    graceTimer = null;
  }
  if (electionTimer !== null) {
    window.clearTimeout(electionTimer);
    electionTimer = null;
  }
};

export type PeerCallbacks = {
  onSnapshot: (table: Table, rev: number) => void;
  onUpdate: (table: Table, rev: number) => void;
  onJoin: (player: Player, table: Table, rejoin: RejoinInfo) => Table | null;
  onFallback: (fallback: boolean) => void;
  onReject: (reason: JoinRejectReason) => void;
};

type PeerRole = "host" | "client" | null;

type ClientConn = { conn: DataConnection; playerId: string };

export type HostElectionState = {
  active: boolean;
  round: number;
  epoch: number;
  participants: string[];
  votes: Record<string, string>;
  selfVote: string | null;
  deadline: number;
  failed: boolean;
  hostId: string;
  tableId: string;
  playerId: string;
};

type PeerDataState = {
  peer: Peer | null;
  role: PeerRole;
  tableId: string | null;
  hostConn: DataConnection | null;
  clientConns: ClientConn[];
  latestTable: Table | null;
  rev: number;
  lastRev: number;
  fallback: boolean;
  callbacks: PeerCallbacks | null;
  selfPlayer: Player | null;
  hostPassword: string;
  election: HostElectionState | null;
  startHost: (table: Table, player: Player, cb: PeerCallbacks) => void;
  joinHost: (
    tableId: string,
    player: Player,
    password: string,
    cb: PeerCallbacks,
    baseTable?: Table,
  ) => void;
  sendUpdate: (table: Table) => void;
  sendAction: (action: PlayerAction, data?: unknown) => void;
  castVote: (candidateId: string) => void;
  restartElection: () => void;
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
  state.clientConns.forEach(({ conn }) => {
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

  const broadcastTable = (table: Table, rev: number, from: string): void => {
    get().clientConns.forEach(({ conn, playerId }) => {
      safeSend(conn, {
        type: "update",
        table: maskTableFor(table, playerId),
        rev,
        from,
      });
    });
  };

  const applyHostAction = (
    playerId: string,
    action: PlayerAction,
    data?: unknown,
  ): void => {
    const state = get();
    const table = state.latestTable;
    if (!table) return;
    const state2 = table.game.state;
    if (action === "startGame" && state2 !== "waiting") return;
    if (action === "newGame" && state2 !== "ended") return;
    if (action === "resetSession" && state2 !== "ended") return;
    if ((action === "ready" || action === "star") && state2 !== "waiting") {
      return;
    }
    const isTurnAction = TurnActions.has(action);
    const actingId = isTurnAction
      ? playerId
      : intendedPlayerId(table, playerId, action, data);
    const expected = isTurnAction ? table.game.currentPlayerId : playerId;
    if (actingId !== expected) return;
    if (isTurnAction) {
      const sender = table.game.players.find((gp) => gp.id === playerId);
      if (sender?.isAway) return;
    }
    const actionData = isTurnAction
      ? {
          ...(data as Record<string, unknown> | undefined),
          actingPlayerId: playerId,
        }
      : data;
    const next = applyAction(table, playerId, action, actionData);
    if (next === table) return;
    const rev = state.rev + 1;
    set({ latestTable: next, rev });
    broadcastTable(next, rev, playerId);
    state.callbacks?.onUpdate(next, rev);
  };

  const endElection = (): void => {
    if (electionTimer !== null) {
      window.clearTimeout(electionTimer);
      electionTimer = null;
    }
    electionConns.forEach((conn) => {
      try {
        conn.close();
      } catch {
        /* noop */
      }
    });
    electionConns = new Map();
    if (get().election) {
      set({ election: null });
    }
  };

  const evaluateElection = (): void => {
    const el = get().election;
    if (!el || !el.active || el.failed) return;
    if (el.participants.length === 0) return;
    const picks = el.participants.map((pid) => el.votes[pid]);
    if (picks.some((pid) => !pid)) return;
    const first = picks[0];
    if (!picks.every((pid) => pid === first)) return;
    const winner = first as string;
    const state = get();
    const table = state.latestTable;
    const self = state.selfPlayer;
    const callbacks = state.callbacks;
    if (!table || !self || !callbacks) return;
    const promoted = promoteHost(table, winner);
    endElection();
    set({ latestTable: promoted });
    if (winner === self.id) {
      state.startHost(promoted, self, callbacks);
      callbacks.onSnapshot(promoted, get().rev);
    } else {
      state.joinHost(promoted.id, self, promoted.password, callbacks, promoted);
    }
  };

  const handleElectionMsg = (conn: DataConnection, data: unknown): void => {
    const el = get().election;
    if (!el || !el.active) return;
    const msg = parsePeerMsg(data);
    if (!msg) return;
    if (msg.type === "present") {
      if (msg.epoch < el.epoch) return;
      const table = get().latestTable;
      const known = table?.game.players.some(
        (gp) => gp.id === msg.playerId && !gp.isAway && gp.id !== el.hostId,
      );
      if (!known) return;
      const cur = get().election;
      if (!cur) return;
      const round = Math.max(cur.round, msg.round);
      const alreadyIn = cur.participants.includes(msg.playerId);
      const participants = alreadyIn
        ? cur.participants
        : [...cur.participants, msg.playerId];
      if (round !== cur.round || participants !== cur.participants) {
        set({ election: { ...cur, round, participants } });
      }
      if (!alreadyIn) {
        safeSend(conn, {
          type: "present",
          playerId: el.playerId,
          epoch: el.epoch,
          round,
        });
      }
      if (el.selfVote) {
        safeSend(conn, {
          type: "vote",
          voterId: el.playerId,
          candidateId: el.selfVote,
          epoch: el.epoch,
          round,
        });
      }
      evaluateElection();
      return;
    }
    if (msg.type === "vote") {
      if (msg.epoch < el.epoch || msg.round < el.round) return;
      set((state) =>
        state.election
          ? {
              election: {
                ...state.election,
                votes: {
                  ...state.election.votes,
                  [msg.voterId]: msg.candidateId,
                },
              },
            }
          : {},
      );
      evaluateElection();
    }
  };

  const beginElection = (): void => {
    const state = get();
    const table = state.latestTable;
    const self = state.selfPlayer;
    const peer = state.peer;
    if (state.role !== "client" || !peer || !table || !self) return;
    if (state.election?.active) return;

    const epoch = table.hostEpoch ?? 0;
    electionRound += 1;
    const round = electionRound;
    electionConns = new Map();
    set({
      election: {
        active: true,
        round,
        epoch,
        participants: [self.id],
        votes: {},
        selfVote: null,
        deadline: Date.now() + ELECTION_ROUND_MS,
        failed: false,
        hostId: table.hostId,
        tableId: table.id,
        playerId: self.id,
      },
    });

    table.game.players
      .filter((gp) => gp.id !== self.id && gp.id !== table.hostId && !gp.isAway)
      .forEach((gp) => {
        const conn = peer.connect(clientPeerId(gp.id), { reliable: true });
        electionConns.set(gp.id, conn);
        conn.on("open", () => {
          if (!get().election?.active) return;
          safeSend(conn, {
            type: "present",
            playerId: self.id,
            epoch,
            round,
          });
        });
        conn.on("data", (data) => handleElectionMsg(conn, data));
        conn.on("close", () => electionConns.delete(gp.id));
        conn.on("error", () => electionConns.delete(gp.id));
      });

    electionTimer = window.setTimeout(() => {
      electionTimer = null;
      const el = get().election;
      if (!el || !el.active) return;
      if (el.participants.length === 1) {
        const state2 = get();
        const table2 = state2.latestTable;
        const self2 = state2.selfPlayer;
        const callbacks = state2.callbacks;
        if (table2 && self2 && callbacks) {
          const promoted = promoteHost(table2, self2.id);
          endElection();
          set({ latestTable: promoted });
          state2.startHost(promoted, self2, callbacks);
          callbacks.onSnapshot(promoted, get().rev);
        }
        return;
      }
      set((s) =>
        s.election ? { election: { ...s.election, failed: true } } : {},
      );
    }, ELECTION_ROUND_MS);
  };

  const startGraceTimer = (): void => {
    if (graceTimer !== null) return;
    graceTimer = window.setTimeout(() => {
      graceTimer = null;
      if (!wasConnected) return;
      beginElection();
    }, HOST_GRACE_MS);
  };

  const clearGraceTimer = (): void => {
    if (graceTimer !== null) {
      window.clearTimeout(graceTimer);
      graceTimer = null;
    }
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
    selfPlayer: null,
    hostPassword: "",
    election: null,

    startHost: (table, player, cb) => {
      const prev = get();
      if (prev.tableId !== table.id) hostClaimAttempt = 0;
      session += 1;
      const mySession = session;
      clearTimers();
      endElection();
      wasConnected = false;
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
        selfPlayer: player,
        hostPassword: table.password,
      });

      peer.on("open", () => {
        if (mySession !== session) return;
        hostClaimAttempt = 0;
        setFallback(false, cb);
      });

      const dropClientConn = (conn: DataConnection): void => {
        if (mySession !== session) return;
        const state = get();
        const info = state.clientConns.find((c) => c.conn === conn);
        connLastSeen.delete(conn);
        if (!info) return;
        const remaining = state.clientConns.filter((c) => c.conn !== conn);
        set({ clientConns: remaining });
        const playerId = info.playerId;
        if (!playerId || playerId === state.selfPlayer?.id) return;
        if (remaining.some((c) => c.playerId === playerId)) return;
        const latest = state.latestTable;
        if (
          !latest ||
          !latest.game.players.some((item) => item.id === playerId)
        ) {
          return;
        }
        const next = markPlayerDisconnected(latest, playerId);
        if (next === latest) return;
        const rev = state.rev + 1;
        set({ latestTable: next, rev });
        broadcastTable(next, rev, playerId);
        state.callbacks?.onUpdate(next, rev);
      };

      const heartbeat = (): void => {
        if (mySession !== session) return;
        if (get().role !== "host") return;
        const now = Date.now();
        for (const { conn, playerId } of get().clientConns) {
          const last = connLastSeen.get(conn);
          if (last === undefined) {
            connLastSeen.set(conn, now);
          } else if (now - last > HEARTBEAT_TIMEOUT_MS) {
            dropClientConn(conn);
            continue;
          }
          safeSend(conn, { type: "ping", playerId });
        }
        heartbeatTimer = window.setTimeout(heartbeat, HEARTBEAT_INTERVAL_MS);
      };

      heartbeatTimer = window.setTimeout(heartbeat, HEARTBEAT_INTERVAL_MS);

      peer.on("connection", (conn) => {
        conn.on("data", (data) => {
          if (mySession !== session) return;
          const msg = parsePeerMsg(data);
          if (!msg) return;
          if (msg.type === "pong") {
            connLastSeen.set(conn, Date.now());
            return;
          }
          if (msg.type === "hello") {
            const state = get();
            if (!state.clientConns.some((c) => c.conn === conn)) {
              set({
                clientConns: [
                  ...state.clientConns,
                  { conn, playerId: msg.playerId },
                ],
              });
            }
            connLastSeen.set(conn, Date.now());
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
              connLastSeen.delete(conn);
              set({
                clientConns: get().clientConns.filter((c) => c.conn !== conn),
              });
              return;
            }

            const merged = get().callbacks?.onJoin(joining, latest, {
              gameId: msg.gameId,
              cards: msg.cards,
            });
            if (merged && merged !== latest) {
              const rev = get().rev + 1;
              set({ latestTable: merged, rev });
              latest = merged;
              broadcastTable(merged, rev, joining.id);
              get().callbacks?.onUpdate(merged, rev);
            }

            safeSend(conn, {
              type: "snapshot",
              table: maskTableFor(latest, joining.id),
              rev: get().rev,
              from: joining.id,
            });
            return;
          }
          if (msg.type === "action") {
            const connInfo = get().clientConns.find((c) => c.conn === conn);
            if (!connInfo || connInfo.playerId !== msg.playerId) return;
            applyHostAction(msg.playerId, msg.action, msg.data);
          }
        });

        conn.on("close", () => dropClientConn(conn));
        conn.on("error", () => dropClientConn(conn));
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
        hostClaimAttempt += 1;
        if (hostClaimAttempt > MAX_PEER_RETRIES) {
          get().joinHost(
            table.id,
            player,
            table.password,
            cb,
            get().latestTable ?? table,
          );
          return;
        }
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
      endElection();
      reportedFallback = null;
      destroyState(prev);
      connectAttempt = 0;
      if (prev.tableId !== tableId) {
        wasConnected = false;
        signalingAttempt = 0;
        electionRound = 0;
        clientIdRetried = false;
        clientIdSuffix = "";
      }
      const seeded =
        prev.tableId === tableId
          ? (prev.latestTable ?? baseTable ?? null)
          : (baseTable ?? null);

      const peerId = clientIdSuffix
        ? `${clientPeerId(player.id)}-${clientIdSuffix}`
        : clientPeerId(player.id);
      const peer = new Peer(peerId, peerOptions());
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
        selfPlayer: player,
        hostPassword: password,
      });

      peer.on("connection", (conn) => {
        conn.on("data", (data) => {
          if (get().election?.active) handleElectionMsg(conn, data);
        });
        conn.on("close", () => {
          electionConns.forEach((c, pid) => {
            if (c === conn) electionConns.delete(pid);
          });
        });
        conn.on("error", () => {
          electionConns.forEach((c, pid) => {
            if (c === conn) electionConns.delete(pid);
          });
        });
      });

      const scheduleReconnect = (retry: () => void): boolean => {
        connectAttempt += 1;
        if (!wasConnected && connectAttempt > MAX_PEER_RETRIES) return false;
        if (hostRetryTimer !== null) {
          window.clearTimeout(hostRetryTimer);
        }
        hostRetryTimer = window.setTimeout(() => {
          hostRetryTimer = null;
          if (mySession !== session) return;
          retry();
        }, HOST_RETRY_MS);
        return true;
      };

      const connectToHost = (): void => {
        if (mySession !== session) return;
        if (get().hostConn?.open) return;
        clearConnectTimer();
        clearHostWatchdog();
        lastHostPing = 0;
        const conn = peer.connect(tablePeerId(tableId), { reliable: true });
        set({ hostConn: conn });

        connectTimer = window.setTimeout(() => {
          connectTimer = null;
          if (mySession !== session) return;
          if (get().hostConn?.open) return;
          startGraceTimer();
          if (!scheduleReconnect(connectToHost)) {
            setFallback(true, cb);
          }
        }, CONNECT_TIMEOUT_MS);

        conn.on("open", () => {
          if (mySession !== session) return;
          clearConnectTimer();
          connectAttempt = 0;
          signalingAttempt = 0;
          wasConnected = true;
          clearGraceTimer();
          endElection();
          setFallback(false, cb);
          lastHostPing = Date.now();
          const latest = get().latestTable;
          const self = latest?.game.players.find(
            (item) => item.id === player.id,
          );
          const local = useLocalGame.getState().localGame;
          const localMatches =
            local?.tableId === tableId && local?.playerId === player.id;
          const cards =
            (self?.cards?.length ? self.cards : undefined) ??
            (localMatches ? local?.cards : undefined);
          const gameId =
            latest?.game.id ?? (localMatches ? local?.gameId : undefined);
          safeSend(conn, {
            type: "hello",
            playerId: player.id,
            name: player.name,
            password,
            cards,
            gameId,
          });
        });

        conn.on("data", (data) => {
          if (mySession !== session) return;
          const msg = parsePeerMsg(data);
          if (!msg) return;
          if (msg.type === "ping") {
            lastHostPing = Date.now();
            safeSend(conn, { type: "pong", playerId: player.id });
            return;
          }
          const localEpoch = get().latestTable?.hostEpoch ?? 0;
          if (msg.type === "snapshot") {
            if ((msg.table.hostEpoch ?? 0) < localEpoch) return;
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
            if ((msg.table.hostEpoch ?? 0) < localEpoch) return;
            if (!shouldApplyRevision(msg.rev, get().lastRev)) return;
            set({ latestTable: msg.table, lastRev: msg.rev });
            cb.onUpdate(msg.table, msg.rev);
          }
        });

        const onDrop = () => {
          if (mySession !== session) return;
          clearHostWatchdog();
          clearConnectTimer();
          set({ hostConn: null });
          startGraceTimer();
          if (!scheduleReconnect(connectToHost)) {
            setFallback(true, cb);
          }
        };

        conn.on("close", onDrop);
        conn.on("error", onDrop);

        hostWatchdogTimer = window.setInterval(() => {
          if (mySession !== session) return;
          if (get().hostConn !== conn) {
            clearHostWatchdog();
            return;
          }
          if (!lastHostPing) return;
          if (Date.now() - lastHostPing > HEARTBEAT_TIMEOUT_MS) {
            onDrop();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      connectTimer = window.setTimeout(() => {
        connectTimer = null;
        if (mySession !== session) return;
        if (peer.open) return;
        signalingAttempt += 1;
        if (!wasConnected && signalingAttempt > MAX_PEER_RETRIES) {
          setFallback(true, cb);
          return;
        }
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
      }, CONNECT_TIMEOUT_MS);

      peer.on("open", () => {
        if (mySession !== session) return;
        connectToHost();
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
        const message = String((err as { message?: string }).message ?? "");
        if (type === "peer-unavailable") {
          if (message.includes(tablePeerId(tableId))) {
            clearConnectTimer();
            set({ hostConn: null });
            startGraceTimer();
            if (!scheduleReconnect(connectToHost)) {
              setFallback(true, cb);
            }
          }
          return;
        }
        if (type === "unavailable-id") {
          if (!clientIdRetried) {
            clientIdRetried = true;
          } else if (!clientIdSuffix) {
            clientIdSuffix = Math.random().toString(36).slice(2, 8);
          } else {
            setFallback(true, cb);
            return;
          }
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
          return;
        }
        setFallback(true, cb);
      });
    },

    sendUpdate: (table) => {
      const state = get();
      if (state.role !== "host") return;
      const rev = state.rev + 1;
      set({ latestTable: table, rev });
      broadcastTable(table, rev, "host");
    },

    sendAction: (action, data) => {
      const state = get();
      if (state.role === "host") {
        const self = state.selfPlayer;
        if (!self) return;
        applyHostAction(self.id, action, data);
        return;
      }
      if (state.role === "client" && state.hostConn?.open) {
        const self = state.selfPlayer;
        if (!self) return;
        const rev = state.lastRev + 1;
        safeSend(state.hostConn, {
          type: "action",
          playerId: self.id,
          action,
          data,
          rev,
          from: self.id,
        });
      }
    },

    castVote: (candidateId) => {
      const el = get().election;
      if (!el || !el.active) return;
      set({
        election: {
          ...el,
          selfVote: candidateId,
          votes: { ...el.votes, [el.playerId]: candidateId },
        },
      });
      const msg: PeerMsg = {
        type: "vote",
        voterId: el.playerId,
        candidateId,
        epoch: el.epoch,
        round: el.round,
      };
      electionConns.forEach((conn) => safeSend(conn, msg));
      evaluateElection();
    },

    restartElection: () => {
      if (!get().election) return;
      endElection();
      beginElection();
    },

    stop: () => {
      session += 1;
      clearTimers();
      endElection();
      wasConnected = false;
      signalingAttempt = 0;
      electionRound = 0;
      hostClaimAttempt = 0;
      clientIdRetried = false;
      clientIdSuffix = "";
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
        selfPlayer: null,
        hostPassword: "",
        election: null,
      });
    },
  };
});

export default usePeerData;

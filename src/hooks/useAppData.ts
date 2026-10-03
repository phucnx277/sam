import { useCallback, useState } from "react";
import Objects from "ably/objects";
import * as Ably from "ably";
import { create } from "zustand";
import {
  deepEqual,
  encodeApiKey,
  decodeApiKey,
  parseTable,
  parseTables,
  stringifyValues,
  type TableLinkMode,
} from "@logic/util";
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  applyRejoin,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
import { applyAction } from "@logic/game";
import usePeerData, { type PeerCallbacks } from "@hooks/usePeerData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useLocalGame from "@hooks/useLocalGame";

const LS_API_KEY = "sam.apiKey";
const CHANNEL_ID = "sam.lobby";
const Keys = {
  Tables: "tables",
};
const POLL_INTERVAL_MS = 3000;

const LS_MODE = "sam.mode";
const LEGACY_PEER_TABLES_KEY = "sam.tables";
localStorage.removeItem(LEGACY_PEER_TABLES_KEY);

const DEAL_ACTIONS = new Set<PlayerAction>([
  "startGame",
  "newGame",
  "resetSession",
]);

export type TransportMode = TableLinkMode;
export type PeerError = JoinRejectReason | "unreachable";

const getStoredMode = (): TransportMode | null => {
  const mode = localStorage.getItem(LS_MODE);
  return mode === "ably" || mode === "peer" ? mode : null;
};

const storeMode = (mode: TransportMode): void => {
  localStorage.setItem(LS_MODE, mode);
};

const clearStoredMode = (): void => {
  localStorage.removeItem(LS_MODE);
};

let pollTimer: number | null = null;
let initGeneration = 0;

const useAblyStore = create<{
  client: Ably.Realtime | null;
  channel: Ably.RealtimeChannel | null;
  tablesMap: Ably.LiveMap<Ably.LiveMapType> | null;
  tables: Table[];
  playingTable: Table | null;
  isPeerFallback: boolean;
  mode: TransportMode | null;
  peerError: PeerError | null;
  initAbly: (key: string) => Promise<{ error: Error | null }>;
  initPeer: () => void;
  switchToAbly: () => void;
  joinPeerTable: (tableId: string, password: string) => void;
  clearPeerError: () => void;
  setPlayingTable: (data: Table) => Error | null;
  unsetPlayingTable: () => void;
}>((set, get) => ({
  client: null,
  channel: null,
  tablesMap: null,
  tables: [],
  playingTable: null,
  isPeerFallback: false,
  mode: getStoredMode(),
  peerError: null,
  initAbly: async (apiKey: string): Promise<{ error: Error | null }> => {
    const normalizedApiKey = decodeApiKey(apiKey);
    const generation = ++initGeneration;
    let error: Error | null = null;
    let client: Ably.Realtime | null = null;
    try {
      usePeerData.getState().stop();
      stopPolling();

      client = new Ably.Realtime({
        key: normalizedApiKey,
        plugins: { Objects },
      });
      const channel = client.channels.get(CHANNEL_ID, {
        modes: ["OBJECT_SUBSCRIBE", "OBJECT_PUBLISH"],
      });
      await channel.attach();
      if (generation !== initGeneration) {
        client.close();
        return { error: null };
      }
      const root = await channel.objects.getRoot();

      let tablesMap = root.get(Keys.Tables) as Ably.LiveMap<Ably.LiveMapType>;
      if (!tablesMap) {
        tablesMap = await channel.objects.createMap();
        await root.set(Keys.Tables, tablesMap);
      }

      if (generation !== initGeneration) {
        client.close();
        return { error: null };
      }

      const { client: oldClient } = get();
      if (oldClient) {
        oldClient.close();
      }

      set({
        client,
        channel,
        tablesMap,
        tables: parseTables(tablesMap.entries()),
        playingTable: null,
        isPeerFallback: false,
        mode: "ably",
        peerError: null,
      });
      storeApiKey(normalizedApiKey);
      storeMode("ably");
    } catch (err) {
      if ("function" === typeof client?.close) {
        client.close();
      }
      error = err as Error;
    }

    return { error };
  },
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
    return null;
  },
  unsetPlayingTable: () => {
    set({ playingTable: null });
  },
  initPeer: () => {
    initGeneration += 1;
    const { client: oldClient } = get();
    if (oldClient) {
      oldClient.close();
    }
    usePeerData.getState().stop();
    stopPolling();
    storeMode("peer");
    set({
      mode: "peer",
      client: null,
      channel: null,
      tablesMap: null,
      tables: [],
      playingTable: null,
      isPeerFallback: false,
      peerError: null,
    });
  },
  switchToAbly: () => {
    initGeneration += 1;
    const { client: oldClient } = get();
    if (oldClient) {
      oldClient.close();
    }
    usePeerData.getState().stop();
    stopPolling();
    clearStoredMode();
    set({
      mode: null,
      client: null,
      channel: null,
      tablesMap: null,
      tables: [],
      playingTable: null,
      isPeerFallback: false,
      peerError: null,
    });
  },
  joinPeerTable: (tableId: string, password: string) => {
    const localPlayer = useLocalPlayer.getState().localPlayer;
    if (!localPlayer) return;
    if (get().mode !== "peer") {
      get().initPeer();
    }
    set({ peerError: null });
    usePeerData.getState().joinHost(tableId, localPlayer, password, bridge);
  },
  clearPeerError: () => {
    set({ peerError: null });
  },
}));

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function persistTableToAbly(data: Table): Promise<Error | null> {
  if (useAblyStore.getState().mode === "peer") return null;
  const { channel } = useAblyStore.getState();
  if (!channel) return new Error("Ably channel is not initialized");
  try {
    await channel.objects.batch((ctx) => {
      const root = ctx.getRoot();
      const tablesMap = root.get(
        Keys.Tables,
      ) as Ably.LiveMap<Ably.LiveMapType> | undefined;
      if (!tablesMap) return;
      const tableMap = tablesMap.get(
        data.id,
      ) as Ably.LiveMap<Ably.LiveMapType> | undefined;
      if (!tableMap) return;
      const tableMapData = parseTable(tableMap.entries());
      if (!tableMapData) return;
      let updated = false;
      for (const k in data) {
        const key = k as keyof Table;
        if (!deepEqual(data[key], tableMapData[key])) {
          updated = true;
          tableMap.set(key, JSON.stringify(data[key]));
        }
      }
      if (updated) {
        tableMap.set("updatedAt", JSON.stringify(Date.now()));
      }
    });
    return null;
  } catch (err) {
    console.error("[ably] failed to persist table", data.id, err);
    return err as Error;
  }
}

const bridge: PeerCallbacks = {
  onSnapshot: (table) => {
    setTimeout(() => {
      const { mode, setPlayingTable } = useAblyStore.getState();
      if (mode === "peer") {
        useAblyStore.setState({ peerError: null });
        setPlayingTable(table);
      } else {
        applyRemoteTable(table);
      }
    }, 0);
  },
  onUpdate: (table) => {
    setTimeout(() => {
      if (usePeerData.getState().role === "host") {
        void persistTableToAbly(table);
      }
      applyRemoteTable(table);
    }, 0);
  },
  onJoin: (player, table) => {
    const present = table.game.players.some((item) => item.id === player.id);
    if (!present) {
      if (table.game.players.length >= table.playerLimit) {
        return null;
      }
      const merged = addTablePlayer(table, player);
      void persistTableToAbly(merged);
      return merged;
    }
    const merged = applyRejoin(table, player.id);
    if (merged !== table) {
      void persistTableToAbly(merged);
    }
    return merged;
  },
  onFallback: (fallback) => {
    if (useAblyStore.getState().mode === "peer") {
      if (fallback) {
        useAblyStore.setState({ peerError: "unreachable" });
      }
      return;
    }
    useAblyStore.setState({ isPeerFallback: fallback });
    const tableId = usePeerData.getState().tableId;
    if (fallback && tableId) {
      startPolling(tableId);
    } else {
      stopPolling();
    }
  },
  onReject: (reason) => {
    useAblyStore.setState({ peerError: reason });
  },
};

function reconcilePeerRole(table: Table): void {
  if (useAblyStore.getState().mode === "peer") return;

  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId !== table.id) return;

  if (table.hostId === localPlayer.id && peer.role !== "host") {
    stopPolling();
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    stopPolling();
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
  }
}

function applyRemoteTable(table: Table): void {
  const current = useAblyStore.getState();
  if (current.mode === "peer") {
    if (current.playingTable?.id === table.id) {
      current.setPlayingTable(table);
    }
    return;
  }

  const peer = usePeerData.getState();
  if (current.playingTable?.id !== table.id && peer.tableId !== table.id) {
    return;
  }

  useAblyStore.setState((state) => {
    const tables = state.tables.some((item) => item.id === table.id)
      ? state.tables.map((item) => (item.id === table.id ? table : item))
      : [...state.tables, table];
    if (state.playingTable?.id === table.id) {
      return { playingTable: table, tables };
    }
    return { tables };
  });

  reconcilePeerRole(table);
}

function startPeerSession(
  table: Table,
  player: Player,
  password: string,
): void {
  stopPolling();
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(table.id, player, password, bridge, table);
  }
}

async function refreshTableFromAbly(tableId: string): Promise<void> {
  const state = useAblyStore.getState();
  if (!state.tablesMap) return;
  const tableMap = state.tablesMap.get(tableId) as Ably.LiveMap<Ably.LiveMapType>;
  if (!tableMap) return;
  const table = parseTable(tableMap.entries());
  if (!table) return;
  applyRemoteTable(table);
}

function startPolling(tableId: string): void {
  if (useAblyStore.getState().mode === "peer") return;
  stopPolling();
  pollTimer = window.setInterval(() => {
    void refreshTableFromAbly(tableId);
  }, POLL_INTERVAL_MS);
}

const useAppData = () => {
  const {
    channel,
    tablesMap,
    tables,
    playingTable,
    isPeerFallback,
    mode,
    peerError,
    initAbly,
    initPeer,
    switchToAbly,
    joinPeerTable,
    clearPeerError,
    setPlayingTable,
    unsetPlayingTable,
  } = useAblyStore();

  const election = usePeerData((s) => s.election);
  const castVote = usePeerData((s) => s.castVote);
  const restartElection = usePeerData((s) => s.restartElection);

  const [isUpdatingTable, setIsUpdatingTable] = useState(false);

  const createTable = useCallback(
    async (params: NewTableParams): Promise<{ error: Error | null }> => {
      let error: Error | null = null;
      try {
        const table = newTable(params);
        if (useAblyStore.getState().mode === "peer") {
          useAblyStore.setState({ peerError: null });
          setPlayingTable(table);
          startPeerSession(table, params.player, params.password);
          return { error: null };
        }
        const tm = await channel!.objects.createMap(stringifyValues(table));
        await tablesMap!.set(table.id, tm);
        setPlayingTable(table);
        startPeerSession(table, params.player, params.password);
      } catch (err) {
        error = err as Error;
      }
      return { error };
    },
    [channel, tablesMap, setPlayingTable],
  );

  const updateTable = useCallback(
    async (data: Table): Promise<Error | null> => {
      setIsUpdatingTable(true);
      try {
        if (data.id === playingTable?.id) {
          setPlayingTable(data);
        }

        usePeerData.getState().sendUpdate(data);
        reconcilePeerRole(data);
        await persistTableToAbly(data);
      } catch (err) {
        return err as Error;
      } finally {
        setIsUpdatingTable(false);
      }
      return null;
    },
    [playingTable, setPlayingTable],
  );

  const dispatchAction = useCallback(
    async (action: PlayerAction, data?: unknown): Promise<Error | null> => {
      const localPlayer = useLocalPlayer.getState().localPlayer;
      if (!localPlayer) return null;
      const table = useAblyStore.getState().playingTable;
      if (!table) return null;

      const role = usePeerData.getState().role;
      if (role) {
        if (role === "client" && !DEAL_ACTIONS.has(action)) {
          setPlayingTable(applyAction(table, localPlayer.id, action, data));
        }
        usePeerData.getState().sendAction(action, data);
        return null;
      }

      return updateTable(applyAction(table, localPlayer.id, action, data));
    },
    [setPlayingTable, updateTable],
  );

  const enterTable = useCallback(
    async (params: EnterTableParams): Promise<Error | null> => {
      const { error: err, table } = joinTable(params);
      if (err || !table) return err;
      const error = setPlayingTable(table);
      if (error) return error;
      startPeerSession(table, params.player, params.password);
      return null;
    },
    [setPlayingTable],
  );

  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    stopPolling();
    useAblyStore.setState({ isPeerFallback: false });
    useLocalGame.getState().clearLocalGame();
    unsetPlayingTable();
  }, [unsetPlayingTable]);

  const removeTable = useCallback(
    async (tableId: string): Promise<Error | null> => {
      if (useAblyStore.getState().mode === "peer") {
        const tables = useAblyStore
          .getState()
          .tables.filter((item) => item.id !== tableId);
        useAblyStore.setState({ tables });
        if (
          usePeerData.getState().tableId === tableId ||
          useAblyStore.getState().playingTable?.id === tableId
        ) {
          usePeerData.getState().stop();
          stopPolling();
          useLocalGame.getState().clearLocalGame();
          unsetPlayingTable();
        }
        return null;
      }

      let error: Error | null = null;
      try {
        tablesMap!.remove(tableId);
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          stopPolling();
          useAblyStore.setState({ isPeerFallback: false });
          useLocalGame.getState().clearLocalGame();
          unsetPlayingTable();
        }
      } catch (err) {
        error = err as Error;
      }
      return error;
    },
    [tablesMap, unsetPlayingTable],
  );

  return {
    isInitialized: mode === "peer" || !!tablesMap,
    init: initAbly,
    initAbly,
    initPeer,
    switchToAbly,
    joinPeerTable,
    clearPeerError,
    mode,
    peerError,
    tables,
    playingTable,
    isPeerFallback,
    election,
    castVote,
    restartElection,
    createTable,
    enterTable,
    updateTable,
    dispatchAction,
    isUpdatingTable,
    removeTable,
    leaveTable,
    getApiKey,
  };
};

export const getTables = (): Table[] => useAblyStore.getState().tables;

const storeApiKey = (apiKey: string) => {
  localStorage.setItem(LS_API_KEY, apiKey);
};

const getApiKey = (
  type: "encoded" | "original",
  apiKey?: string | null,
): string => {
  apiKey = apiKey ?? localStorage.getItem(LS_API_KEY);
  if (!apiKey) return "";
  switch (type) {
    case "encoded":
      apiKey = encodeApiKey(apiKey);
      break;
    case "original":
      apiKey = decodeApiKey(apiKey);
      break;
  }
  return apiKey;
};

export default useAppData;

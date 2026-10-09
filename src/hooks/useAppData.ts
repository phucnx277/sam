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
  isTableMember,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
import { appendChatMessage, makeTextMessage } from "@logic/chat";
import usePeerData, { type PeerCallbacks } from "@hooks/usePeerData";
import useLocalPlayer from "@hooks/useLocalPlayer";

const LS_API_KEY = "sam.apiKey";
const CHANNEL_ID = "sam.lobby";
const Keys = {
  Tables: "tables",
  Transports: "transports",
};

const LS_MODE = "sam.mode";
const LS_PEER_TABLES = "sam.tables";

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

const getPeerTables = (): Table[] => {
  const stored = localStorage.getItem(LS_PEER_TABLES);
  if (!stored) return [];
  try {
    const data = JSON.parse(stored);
    return Array.isArray(data) ? (data as Table[]) : [];
  } catch {
    return [];
  }
};

const savePeerTables = (tables: Table[]): void => {
  localStorage.setItem(LS_PEER_TABLES, JSON.stringify(tables));
};

let initGeneration = 0;
let lobbySub: Ably.SubscribeResponse | null = null;
let transportsSub: Ably.SubscribeResponse | null = null;
let tableSub: Ably.SubscribeResponse | null = null;
let tableSubTableId: string | null = null;

const useAblyStore = create<{
  client: Ably.Realtime | null;
  channel: Ably.RealtimeChannel | null;
  tablesMap: Ably.LiveMap<Ably.LiveMapType> | null;
  transportsMap: Ably.LiveMap<Ably.LiveMapType> | null;
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
  transportsMap: null,
  tables: getStoredMode() === "peer" ? getPeerTables() : [],
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
      clearTableSubscription();

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
      let transportsMap = root.get(
        Keys.Transports,
      ) as Ably.LiveMap<Ably.LiveMapType>;
      if (!transportsMap) {
        transportsMap = await channel.objects.createMap();
        await root.set(Keys.Transports, transportsMap);
      }

      if (generation !== initGeneration) {
        client.close();
        return { error: null };
      }

      const { client: oldClient } = get();
      clearLobbySubscription();
      clearTransportsSubscription();
      if (oldClient) {
        oldClient.close();
      }

      set({
        client,
        channel,
        tablesMap,
        transportsMap,
        tables: parseTables(tablesMap.entries()),
        playingTable: null,
        isPeerFallback: false,
        mode: "ably",
        peerError: null,
      });
      subscribeLobby(tablesMap);
      subscribeTransports(transportsMap);
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
      const isMember =
        state.mode !== "peer" ||
        (!!localPlayer && isTableMember(data, localPlayer));
      if (!isMember) {
        return { playingTable: data };
      }
      const tables = state.tables.some((item) => item.id === data.id)
        ? state.tables.map((item) => (item.id === data.id ? data : item))
        : [...state.tables, data];
      return { playingTable: data, tables };
    });
    if (get().mode === "peer") {
      savePeerTables(get().tables);
    }
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
    clearTableSubscription();
    clearLobbySubscription();
    clearTransportsSubscription();
    storeMode("peer");
    set({
      mode: "peer",
      client: null,
      channel: null,
      tablesMap: null,
      transportsMap: null,
      tables: getPeerTables(),
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
    clearTableSubscription();
    clearLobbySubscription();
    clearTransportsSubscription();
    clearStoredMode();
    set({
      mode: null,
      client: null,
      channel: null,
      tablesMap: null,
      transportsMap: null,
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

function clearLobbySubscription(): void {
  if (lobbySub) {
    lobbySub.unsubscribe();
    lobbySub = null;
  }
}

function clearTableSubscription(): void {
  if (tableSub) {
    tableSub.unsubscribe();
    tableSub = null;
  }
  tableSubTableId = null;
}

function subscribeLobby(tablesMap: Ably.LiveMap<Ably.LiveMapType>): void {
  clearLobbySubscription();
  lobbySub = tablesMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    const changed = Object.keys(update);
    if (changed.length === 0) return;
    useAblyStore.setState((state) => {
      let tables = state.tables;
      for (const id of changed) {
        if (update[id] === "removed") {
          tables = tables.filter((item) => item.id !== id);
          continue;
        }
        const tableMap = tablesMap.get(id) as
          | Ably.LiveMap<Ably.LiveMapType>
          | undefined;
        const parsed = tableMap ? parseTable(tableMap.entries()) : null;
        if (!parsed || !parsed.id) continue;
        tables = tables.some((item) => item.id === id)
          ? tables.map((item) => (item.id === id ? parsed : item))
          : [...tables, parsed];
      }
      return tables === state.tables ? state : { tables };
    });
  });
}

function subscribeTableFallback(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  if (
    state.playingTable?.id !== tableId &&
    usePeerData.getState().tableId !== tableId
  ) {
    if (tableSubTableId === tableId) {
      clearTableSubscription();
    }
    return;
  }
  if (tableSubTableId === tableId && tableSub) return;
  clearTableSubscription();
  const { tablesMap } = useAblyStore.getState();
  if (!tablesMap) return;
  const tableMap = tablesMap.get(tableId) as
    | Ably.LiveMap<Ably.LiveMapType>
    | undefined;
  if (!tableMap) return;
  tableSubTableId = tableId;
  tableSub = tableMap.subscribe(() => {
    if (useAblyStore.getState().mode === "peer") return;
    const table = parseTable(tableMap.entries());
    if (table) applyRemoteTable(table);
  });
  const table = parseTable(tableMap.entries());
  if (table) applyRemoteTable(table);
}

function clearTransportsSubscription(): void {
  if (transportsSub) {
    transportsSub.unsubscribe();
    transportsSub = null;
  }
}

function subscribeTransports(
  transportsMap: Ably.LiveMap<Ably.LiveMapType>,
): void {
  clearTransportsSubscription();
  transportsSub = transportsMap.subscribe(({ update }) => {
    if (useAblyStore.getState().mode === "peer") return;
    for (const tableId of Object.keys(update)) {
      const mode = transportsMap.get(tableId);
      if (mode === "ably") {
        switchTableToAbly(tableId);
      } else if (mode === "peer") {
        switchToPeerTransport(tableId);
      }
    }
  });
}

function readTableFromAbly(tableId: string): Table | null {
  const { tablesMap } = useAblyStore.getState();
  if (!tablesMap) return null;
  const tableMap = tablesMap.get(tableId) as
    | Ably.LiveMap<Ably.LiveMapType>
    | undefined;
  if (!tableMap) return null;
  return parseTable(tableMap.entries());
}

function isTableOnAbly(tableId: string): boolean {
  const { transportsMap } = useAblyStore.getState();
  return transportsMap?.get(tableId) === "ably";
}

function markTableAbly(tableId: string): void {
  const { transportsMap } = useAblyStore.getState();
  if (!transportsMap) return;
  if (transportsMap.get(tableId) === "ably") return;
  transportsMap.set(tableId, "ably").catch((err) => {
    console.error("[ably] failed to mark table as ably", tableId, err);
  });
}

function switchTableToAbly(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const peer = usePeerData.getState();
  if (state.playingTable?.id !== tableId && peer.tableId !== tableId) return;

  if (!state.isPeerFallback) {
    useAblyStore.setState({ isPeerFallback: true });
  }
  if (peer.role) peer.stop();

  const table = useAblyStore.getState().playingTable;
  const localPlayer = useLocalPlayer.getState().localPlayer;
  const ablyTable = readTableFromAbly(tableId);
  const alreadyMember =
    !!localPlayer &&
    (ablyTable?.game?.players?.some((p) => p.id === localPlayer.id) ?? false);
  if (table && table.id === tableId && localPlayer && !alreadyMember) {
    const merged = addTablePlayer(ablyTable ?? table, localPlayer);
    void persistTableToAbly(merged).then(() =>
      subscribeTableFallback(tableId),
    );
    return;
  }
  subscribeTableFallback(tableId);
}

function switchToPeerTransport(tableId: string): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const table = state.playingTable;
  if (!table || table.id !== tableId) return;
  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId === tableId && peer.role && !state.isPeerFallback) return;

  clearTableSubscription();
  useAblyStore.setState({ isPeerFallback: false });
  if (table.hostId === localPlayer.id) {
    peer.startHost(table, localPlayer, bridge);
  } else {
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
  }
}

function retryPeerTransport(): void {
  const state = useAblyStore.getState();
  if (state.mode === "peer") return;
  const tableId = state.playingTable?.id ?? usePeerData.getState().tableId;
  if (!tableId || !isTableOnAbly(tableId)) return;
  const { transportsMap } = state;
  if (!transportsMap) return;
  transportsMap
    .set(tableId, "peer")
    .then(() => switchToPeerTransport(tableId))
    .catch((err) => {
      console.error("[ably] failed to mark table as peer", tableId, err);
    });
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
    setTimeout(() => applyRemoteTable(table), 0);
  },
  onJoin: (player, table) => {
    if (table.game.players.some((item) => item.id === player.id)) {
      return table;
    }
    if (table.game.players.length >= table.playerLimit) {
      return null;
    }
    const merged = addTablePlayer(table, player);
    void persistTableToAbly(merged);
    return merged;
  },
  onFallback: (fallback) => {
    if (useAblyStore.getState().mode === "peer") {
      if (fallback) {
        useAblyStore.setState({ peerError: "unreachable" });
      }
      return;
    }
    const tableId = usePeerData.getState().tableId;
    if (fallback && tableId) {
      markTableAbly(tableId);
      switchTableToAbly(tableId);
    } else if (!fallback) {
      if (tableId && isTableOnAbly(tableId)) return;
      clearTableSubscription();
      useAblyStore.setState({ isPeerFallback: false });
    }
  },
  onReject: (reason) => {
    useAblyStore.setState({ peerError: reason });
  },
};

function reconcilePeerRole(table: Table): void {
  if (useAblyStore.getState().mode === "peer") return;
  if (isTableOnAbly(table.id)) return;

  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId !== table.id) return;

  if (table.hostId === localPlayer.id && peer.role !== "host") {
    clearTableSubscription();
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    clearTableSubscription();
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
  clearTableSubscription();
  if (isTableOnAbly(table.id)) {
    switchTableToAbly(table.id);
    return;
  }
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(table.id, player, password, bridge, table);
  }
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

  const [isUpdatingTable, setIsUpdatingTable] = useState(false);

  const createTable = useCallback(
    async (
      params: NewTableParams,
    ): Promise<{ error: Error | null; table: Table | null }> => {
      let table: Table | null = null;
      try {
        table = newTable(params);
        if (useAblyStore.getState().mode === "peer") {
          useAblyStore.setState({ peerError: null });
          setPlayingTable(table);
          startPeerSession(table, params.player, params.password);
          return { error: null, table };
        }
        const tm = await channel!.objects.createMap(stringifyValues(table));
        await tablesMap!.set(table.id, tm);
        setPlayingTable(table);
        startPeerSession(table, params.player, params.password);
      } catch (err) {
        return { error: err as Error, table: null };
      }
      return { error: null, table };
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

  const sendChat = useCallback(
    async (text: string): Promise<Error | null> => {
      const table = useAblyStore.getState().playingTable;
      const localPlayer = useLocalPlayer.getState().localPlayer;
      if (!table || !localPlayer) return null;
      if (!table.game.players.some((item) => item.id === localPlayer.id)) {
        return null;
      }
      const message = makeTextMessage(localPlayer, text);
      if (!message) return null;
      return updateTable(appendChatMessage(table, message));
    },
    [updateTable],
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
    clearTableSubscription();
    useAblyStore.setState({ isPeerFallback: false });
    unsetPlayingTable();
  }, [unsetPlayingTable]);

  const removeTable = useCallback(
    async (tableId: string): Promise<Error | null> => {
      if (useAblyStore.getState().mode === "peer") {
        const tables = useAblyStore
          .getState()
          .tables.filter((item) => item.id !== tableId);
        savePeerTables(tables);
        useAblyStore.setState({ tables });
        if (
          usePeerData.getState().tableId === tableId ||
          useAblyStore.getState().playingTable?.id === tableId
        ) {
          usePeerData.getState().stop();
          clearTableSubscription();
          unsetPlayingTable();
        }
        return null;
      }

      let error: Error | null = null;
      try {
        tablesMap!.remove(tableId);
        const transportsMap = useAblyStore.getState().transportsMap;
        if (transportsMap) {
          transportsMap.remove(tableId).catch((err) => {
            console.error(
              "[ably] failed to clear transport marker",
              tableId,
              err,
            );
          });
        }
        if (
          usePeerData.getState().tableId === tableId ||
          useAblyStore.getState().playingTable?.id === tableId
        ) {
          usePeerData.getState().stop();
          clearTableSubscription();
          useAblyStore.setState({ isPeerFallback: false });
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
    createTable,
    enterTable,
    updateTable,
    sendChat,
    isUpdatingTable,
    removeTable,
    leaveTable,
    retryPeerTransport,
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

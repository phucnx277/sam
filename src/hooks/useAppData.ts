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
} from "@logic/util";
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  type EnterTableParams,
  type NewTableParams,
} from "@logic/table";
import usePeerData, { type PeerCallbacks } from "@hooks/usePeerData";
import useLocalPlayer from "@hooks/useLocalPlayer";

const LS_API_KEY = "sam.apiKey";
const CHANNEL_ID = "sam.lobby";
const Keys = {
  Tables: "tables",
};
const POLL_INTERVAL_MS = 3000;

let pollTimer: number | null = null;
let initGeneration = 0;

const useAblyStore = create<{
  client: Ably.Realtime | null;
  channel: Ably.RealtimeChannel | null;
  tablesMap: Ably.LiveMap<Ably.LiveMapType> | null;
  tables: Table[];
  playingTable: Table | null;
  isPeerFallback: boolean;
  init: (key: string) => Promise<{ error: Error | null }>;
  setPlayingTable: (data: Table) => Error | null;
  unsetPlayingTable: () => void;
}>((set, get) => ({
  client: null,
  channel: null,
  tablesMap: null,
  tables: [],
  playingTable: null,
  isPeerFallback: false,
  init: async (apiKey: string): Promise<{ error: Error | null }> => {
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
      });
      storeApiKey(normalizedApiKey);
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
}));

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function persistTableToAbly(data: Table): Promise<Error | null> {
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
    setTimeout(() => applyRemoteTable(table), 0);
  },
  onUpdate: (table) => {
    setTimeout(() => applyRemoteTable(table), 0);
  },
  onJoin: (player, table) => {
    if (table.game.players.some((item) => item.id === player.id)) {
      return table;
    }
    const merged = addTablePlayer(table, player);
    void persistTableToAbly(merged);
    return merged;
  },
  onFallback: (fallback) => {
    useAblyStore.setState({ isPeerFallback: fallback });
    const tableId = usePeerData.getState().tableId;
    if (fallback && tableId) {
      startPolling(tableId);
    } else {
      stopPolling();
    }
  },
};

function reconcilePeerRole(table: Table): void {
  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId !== table.id) return;

  if (table.hostId === localPlayer.id && peer.role !== "host") {
    stopPolling();
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    stopPolling();
    peer.joinHost(table, localPlayer, bridge);
  }
}

function applyRemoteTable(table: Table): void {
  const peer = usePeerData.getState();
  const current = useAblyStore.getState();
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

function startPeerSession(table: Table, player: Player): void {
  stopPolling();
  const peer = usePeerData.getState();
  if (table.hostId === player.id) {
    peer.startHost(table, player, bridge);
  } else {
    peer.joinHost(table, player, bridge);
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
    init,
    setPlayingTable,
    unsetPlayingTable,
  } = useAblyStore();

  const [isUpdatingTable, setIsUpdatingTable] = useState(false);

  const createTable = useCallback(
    async (params: NewTableParams): Promise<{ error: Error | null }> => {
      let error: Error | null = null;
      try {
        const table = newTable(params);
        const tm = await channel!.objects.createMap(stringifyValues(table));
        await tablesMap!.set(table.id, tm);
        setPlayingTable(table);
        startPeerSession(table, params.player);
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

        // P2P is primary and synchronous; Ably is write-through fallback.
        usePeerData.getState().sendUpdate(data);
        // A host transfer happens through a normal update, so reconcile here too.
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

  const enterTable = useCallback(
    async (params: EnterTableParams): Promise<Error | null> => {
      const { error: err, table } = joinTable(params);
      if (err || !table) return err;
      const error = setPlayingTable(table);
      if (error) return error;
      startPeerSession(table, params.player);
      return null;
    },
    [setPlayingTable],
  );

  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    stopPolling();
    useAblyStore.setState({ isPeerFallback: false });
    unsetPlayingTable();
  }, [unsetPlayingTable]);

  const removeTable = useCallback(
    async (tableId: string): Promise<Error | null> => {
      let error: Error | null = null;
      try {
        tablesMap!.remove(tableId);
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          stopPolling();
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
    isInitialized: !!tablesMap,
    init,
    tables,
    playingTable,
    isPeerFallback,
    createTable,
    enterTable,
    updateTable,
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

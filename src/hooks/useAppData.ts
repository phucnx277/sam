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
  type EnterTableParams,
  type NewTableParams,
} from "@logic/table";

const LS_API_KEY = "sam.apiKey";
const CHANNEL_ID = "sam.lobby";
const Keys = {
  Tables: "tables",
};

const useAblyStore = create<{
  channel: Ably.RealtimeChannel | null;
  tablesMap: Ably.LiveMap<Ably.LiveMapType> | null;
  tables: Table[];
  playingTable: Table | null;
  init: (key: string) => Promise<{ error: Error | null }>;
  setPlayingTable: (data: Table) => Error | null;
  unsetPlayingTable: () => void;
}>((set) => ({
  channel: null,
  tablesMap: null,
  playingTableMap: null,
  tables: [],
  playingTable: null,
  init: async (apiKey: string): Promise<{ error: Error | null }> => {
    const normalizedApiKey = decodeApiKey(apiKey);
    let error: Error | null = null;
    try {
      const client = new Ably.Realtime({
        key: normalizedApiKey,
        plugins: { Objects },
      });
      storeApiKey(normalizedApiKey);
      const channel = client.channels.get(CHANNEL_ID, {
        modes: ["OBJECT_SUBSCRIBE", "OBJECT_PUBLISH"],
      });
      await channel.attach();
      const root = await channel.objects.getRoot();

      let tablesMap = root.get(Keys.Tables) as Ably.LiveMap<Ably.LiveMapType>;
      if (!tablesMap) {
        tablesMap = await channel.objects.createMap();
        await root.set(Keys.Tables, tablesMap);
      }

      tablesMap.subscribe(() => {
        const tables = parseTables(tablesMap.entries());
        set((state) => {
          let playingTable = state.playingTable;
          if (tables.findIndex((item) => item.id === playingTable?.id) === -1) {
            playingTable = null;
          }
          return {
            tables,
            playingTable,
          };
        });
      });

      set(() => ({
        channel,
        tablesMap,
        tables: parseTables(tablesMap.entries()),
      }));
    } catch (err) {
      error = err as Error;
    }

    return { error };
  },
  setPlayingTable: (data: Table) => {
    let error: Error | null = null;
    let playingTableMap: Ably.LiveMap<Ably.LiveMapType> | null = null;
    set((state) => {
      playingTableMap = state.tablesMap!.get(
        data.id,
      ) as Ably.LiveMap<Ably.LiveMapType>;

      if (!playingTableMap) {
        error = new Error(`Table with id ${data.id} not found`);
      }

      return {
        playingTable: playingTableMap ? data : null,
      };
    });

    if (playingTableMap) {
      (playingTableMap as Ably.LiveMap<Ably.LiveMapType>).subscribe(() => {
        set((state) => {
          if (state.playingTable?.id === data.id) {
            const newPlayerTable = parseTable(playingTableMap!.entries());
            if (!newPlayerTable) {
              return {};
            }
            const newTables = state.tables.map((item) => {
              if (item.id !== newPlayerTable.id) return { ...item };
              return newPlayerTable;
            });

            return { playingTable: newPlayerTable, tables: newTables };
          }
          playingTableMap?.unsubscribeAll();
          return {};
        });
      });
    }

    return error;
  },
  unsetPlayingTable: () => {
    set((state) => {
      if (!state.playingTable) return {};
      const playingTableMap = state.tablesMap!.get(
        state.playingTable.id,
      ) as Ably.LiveMap<Ably.LiveMapType>;
      if (!playingTableMap) return { playingTable: null };
      playingTableMap.unsubscribeAll();
      return { playingTable: null };
    });
  },
}));

const useAppData = () => {
  const {
    channel,
    tablesMap,
    tables,
    playingTable,
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
        error = setPlayingTable(table);
      } catch (err) {
        error = err as Error;
      }
      return { error };
    },
    [channel, tablesMap, setPlayingTable],
  );

  // TODO: handle concurrent updates
  const updateTable = useCallback(
    async (data: Table): Promise<Error | null> => {
      setIsUpdatingTable(true);
      const oldPlayingTable = { ...playingTable };
      if (data.id === playingTable?.id) {
        setPlayingTable(data);
      }
      let error: Error | null = null;
      try {
        await channel!.objects.batch((ctx) => {
          const root = ctx.getRoot();
          const tablesMap = root.get(
            Keys.Tables,
          ) as Ably.LiveMap<Ably.LiveMapType>;
          const tableMap = tablesMap.get(
            data.id,
          ) as Ably.LiveMap<Ably.LiveMapType>;
          const tableMapData = parseTable(tableMap.entries());
          if (!tableMapData) {
            error = new Error(`Cannot parse table with id ${data.id}`);
            return;
          }
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
      } catch (err) {
        // rollback
        if (data.id === playingTable?.id) {
          setPlayingTable(oldPlayingTable as Table);
        }
        error = err as Error;
      }

      setIsUpdatingTable(false);

      return error;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel],
  );

  const enterTable = useCallback(
    async (params: EnterTableParams): Promise<Error | null> => {
      let error: Error | null = null;
      const { error: err, table } = joinTable(params);
      error = err;
      if (error) return error;
      error = setPlayingTable(table!);
      if (error) return error;
      return updateTable(table!);
    },
    [setPlayingTable, updateTable],
  );

  const removeTable = useCallback(
    async (tableId: string): Promise<Error | null> => {
      let error: Error | null = null;
      try {
        tablesMap!.remove(tableId);
      } catch (err) {
        error = err as Error;
      }
      return error;
    },
    [tablesMap],
  );

  return {
    isInitialized: !!tablesMap,
    init,
    tables,
    playingTable,
    createTable,
    enterTable,
    updateTable,
    isUpdatingTable,
    removeTable,
    leaveTable: () => unsetPlayingTable(),
    getApiKey,
  };
};

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

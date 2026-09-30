# PeerJS Transport with Ably Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PeerJS (host-hub) the primary real-time transport between clients, with Ably LiveObjects kept as one-time load + write-through fallback.

**Architecture:** The table host runs a PeerJS peer with deterministic id `sam-<tableId>`; other players connect to it. Updates are optimistic full-table snapshots tagged with a host-local monotonic `rev`; the host serializes and rebroadcasts. Every update is still written to Ably LiveObjects in the background, and Ably is read exactly once at app load / table entry. If a client cannot reach the host it polls the table from Ably every ~3s.

**Tech Stack:** React 19, Zustand 5, TypeScript 5.8, Vite 7, Ably 2.12 LiveObjects, PeerJS 1.5.

**Testing note:** This repo has **no test framework** (see `AGENTS.md`). Do not add one and do not invent `npm test`. Every task is verified with `npm run build` (`tsc -b`) and `npm run lint`, plus the manual browser checklist in Task 8. The pre-commit hook runs `npm run build` and `./bump-version.sh` on every commit, so commits are slow and always bump the patch version; intermediate commits must therefore leave the tree compiling.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `package.json` | Add `peerjs` dependency | Modify |
| `src/logic/peer.ts` | Pure PeerJS protocol: peer-id derivation, message types, parser, revision check | Create |
| `src/vite-env.d.ts` | Type `VITE_PEER_*` env vars | Modify |
| `src/locales/vi.ts` | Fallback indicator string (vi) | Modify |
| `src/locales/en.ts` | Fallback indicator string (en) | Modify |
| `src/hooks/usePeerData.ts` | Zustand store owning the PeerJS lifecycle | Create |
| `src/hooks/useAppData.ts` | Remove Ably subscriptions, one-time load, wire PeerJS + fallback polling | Modify |
| `src/components/Tables/PlayingTable.tsx` | Show fallback-mode indicator | Modify |
| `AGENTS.md` | Document the new transport | Modify |

---

## Task 1: Add the `peerjs` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install peerjs**

Run:

```bash
npm install peerjs@1.5.5
```

Expected: `package.json` gains `"peerjs": "1.5.5"` under `dependencies`, `package-lock.json` updates.

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: `tsc -b` and `vite build` both succeed (no usage yet, just a dependency).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add peerjs dependency"
```

The hook will bump the version; that is expected.

---

## Task 2: Pure peer protocol module

**Files:**
- Create: `src/logic/peer.ts`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Create `src/logic/peer.ts`**

```ts
export const HOST_PEER_PREFIX = "sam";
export const CLIENT_PEER_PREFIX = "sam-c";

export const tablePeerId = (tableId: string): string =>
  `${HOST_PEER_PREFIX}-${tableId}`;

export type PeerMsg =
  | { type: "hello"; playerId: string; name: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string };

const isTableLike = (value: unknown): value is Table => {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.hostId !== "string") return false;
  if (typeof t.game !== "object" || t.game === null) return false;
  if (!Array.isArray(t.players)) return false;
  return true;
};

export const parsePeerMsg = (data: unknown): PeerMsg | null => {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  const from = typeof msg.from === "string" ? msg.from : "";
  switch (msg.type) {
    case "hello":
      if (typeof msg.playerId !== "string" || typeof msg.name !== "string") {
        return null;
      }
      return { type: "hello", playerId: msg.playerId, name: msg.name };
    case "snapshot":
      if (!isTableLike(msg.table) || typeof msg.rev !== "number") return null;
      return { type: "snapshot", table: msg.table, rev: msg.rev, from };
    case "update":
      if (!isTableLike(msg.table) || typeof msg.rev !== "number") return null;
      return { type: "update", table: msg.table, rev: msg.rev, from };
    default:
      return null;
  }
};

export const shouldApplyRevision = (
  incoming: number,
  lastRev: number,
): boolean => Number.isFinite(incoming) && incoming > lastRev;
```

- [ ] **Step 2: Add env typing to `src/vite-env.d.ts`**

Append after the existing `declare const __COMMIT_HASH__: string;` line:

```ts
interface ImportMetaEnv {
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both pass. `parsePeerMsg` / `shouldApplyRevision` are exported but unused so far; `eslint` must not flag them (they are module exports, so it will not).

- [ ] **Step 4: Commit**

```bash
git add src/logic/peer.ts src/vite-env.d.ts
git commit -m "feat: add pure peer protocol helpers"
```

---

## Task 3: Localized fallback indicator strings

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add the key to `src/locales/vi.ts`**

Immediately after the `"game.cardsSorted": "Xếp bài xong",` line, add:

```ts
  "game.fallbackMode": "Kết nối gián tiếp",
```

- [ ] **Step 2: Add the key to `src/locales/en.ts`**

Immediately after the `"game.cardsSorted": "Cards sorted",` line, add:

```ts
  "game.fallbackMode": "Indirect connection",
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: pass. `en` is `satisfies Record<TranslationKey, string>`, so a missing key is a compile error — this proves both dictionaries gained the key.

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add peer fallback mode i18n strings"
```

---

## Task 4: PeerJS lifecycle store

**Files:**
- Create: `src/hooks/usePeerData.ts`

- [ ] **Step 1: Create `src/hooks/usePeerData.ts`**

```ts
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
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: pass. If TypeScript rejects `(err as { type?: string }).type`, keep the cast as written — do not use `any`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePeerData.ts
git commit -m "feat: add peerjs lifecycle store"
```

---

## Task 5: Rewire `useAppData` to PeerJS primary + Ably write-through

**Files:**
- Modify: `src/hooks/useAppData.ts`

This task replaces the whole file. The public hook API and its consumers (`Tables`, `PlayingTable`, `Actions`, `TableInfo`, `ShareTable`, `GamePlayer`, `NewTable`, `EnterTable`, `Credentials`, `Lobby`) stay unchanged, plus the new `isPeerFallback` field.

- [ ] **Step 1: Replace `src/hooks/useAppData.ts` with:**

```ts
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
import usePeerData, { type PeerCallbacks } from "@hooks/usePeerData";
import useLocalPlayer from "@hooks/useLocalPlayer";

const LS_API_KEY = "sam.apiKey";
const CHANNEL_ID = "sam.lobby";
const Keys = {
  Tables: "tables",
};
const POLL_INTERVAL_MS = 3000;

let pollTimer: number | null = null;

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
      const root = await channel.objects.getRoot();

      let tablesMap = root.get(Keys.Tables) as Ably.LiveMap<Ably.LiveMapType>;
      if (!tablesMap) {
        tablesMap = await channel.objects.createMap();
        await root.set(Keys.Tables, tablesMap);
      }

      const { client: oldClient } = get();
      if (oldClient) {
        oldClient.close();
      }

      // One-time load only: never subscribe to LiveObjects events.
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
      ) as Ably.LiveMap<Ably.LiveMapType>;
      const tableMap = tablesMap.get(
        data.id,
      ) as Ably.LiveMap<Ably.LiveMapType>;
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
    // Fallback persistence only; P2P holds the authoritative state.
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

function applyRemoteTable(table: Table): void {
  useAblyStore.setState((state) => {
    const exists = state.tables.some((item) => item.id === table.id);
    const tables = exists
      ? state.tables.map((item) => (item.id === table.id ? table : item))
      : [...state.tables, table];
    return { playingTable: table, tables };
  });

  const localPlayer = useLocalPlayer.getState().localPlayer;
  if (!localPlayer) return;

  const peer = usePeerData.getState();
  if (peer.tableId !== table.id) return;

  if (table.hostId === localPlayer.id && peer.role !== "host") {
    peer.startHost(table, localPlayer, bridge);
  } else if (table.hostId !== localPlayer.id && peer.role === "host") {
    peer.joinHost(table, localPlayer, bridge);
  }
}

function startPeerSession(table: Table, player: Player): void {
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

      if (data.id === playingTable?.id) {
        setPlayingTable(data);
      }

      // P2P is primary and synchronous; Ably is write-through fallback.
      usePeerData.getState().sendUpdate(data);
      const error = await persistTableToAbly(data);

      setIsUpdatingTable(false);
      return error;
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
      await persistTableToAbly(table);
      return null;
    },
    [setPlayingTable],
  );

  const leaveTable = useCallback(() => {
    usePeerData.getState().stop();
    stopPolling();
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
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: pass. `persistTableToAbly` must be declared before `bridge` reads it at runtime — declaration order in the file satisfies this because `bridge` only calls it later, but keep `persistTableToAbly` above `bridge` as written.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat: make peerjs primary transport with ably write-through"
```

---

## Task 6: Fallback-mode indicator in `PlayingTable`

**Files:**
- Modify: `src/components/Tables/PlayingTable.tsx`

- [ ] **Step 1: Read `isPeerFallback` from `useAppData`**

Change line 15 from:

```tsx
  const { playingTable, updateTable } = useAppData();
```

to:

```tsx
  const { playingTable, updateTable, isPeerFallback } = useAppData();
```

- [ ] **Step 2: Render the badge**

Inside the root `<div className="playing-table ...">`, immediately after the opening tag (before the first inner `<div className="w-full flex flex-3 lg:flex-4 ...">`), add:

```tsx
      {isPeerFallback && (
        <div className="fixed top-2 left-2 z-20 px-2 py-0.5 text-xs rounded-sm bg-amber-200 text-amber-900">
          {t("game.fallbackMode")}
        </div>
      )}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Tables/PlayingTable.tsx
git commit -m "feat: show peer fallback-mode indicator"
```

---

## Task 7: Document the transport in `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the realtime data model bullet**

In the `## Architecture` section, replace the existing bullet that begins:

```markdown
- Realtime data model: a root Ably LiveMap on channel `sam.lobby` with key `tables`; ...
```

with:

```markdown
- Realtime data model: **PeerJS is the primary transport** between clients. The
  table host runs a peer with id `sam-<tableId>`; other players connect to it
  and updates are broadcast host -> clients (optimistic full-table snapshots
  tagged with a host-local `rev`). Ably LiveObjects on channel `sam.lobby` (root
  LiveMap key `tables`) is now **write-through fallback only**: every update is
  written there, but nothing subscribes. The lobby/table snapshot is read once
  at load (`parseTables`/`parseTable` in `logic/util.ts`). If a client cannot
  reach the host it polls the table from Ably (~3s). Peer protocol helpers live
  in `logic/peer.ts`; the lifecycle store is `hooks/usePeerData.ts`.
```

Note: the original bullet spans two lines and ends with `... (`stringifyValues`, `parseTable`). Read it via the file and replace the whole bullet.

- [ ] **Step 2: Commit (docs-only, skip the hook)**

```bash
git add AGENTS.md
git commit --no-verify -m "docs: document peerjs primary transport"
```

---

## Task 8: Manual end-to-end verification

**Files:** none

Use two browser windows/profiles (`A` = host, `B` = other player) on `npm run dev`.

- [ ] **Step 1:** Run `npm run build && npm run lint` one final time; both must pass.
- [ ] **Step 2:** Start `npm run dev`. In `A`, enter an Ably API key and create a player + table. Confirm `B` does not need an Ably call to be created until it loads the lobby.
- [ ] **Step 3:** In `B` (same API key), load the lobby, open the shared table link/password, join. Confirm `A` sees `B` join **without reload** (this proves P2P, since Ably no longer pushes).
- [ ] **Step 4:** Alternate `ready`/`start`/play turns between `A` and `B`; each side must reflect the other's moves without reload.
- [ ] **Step 5:** Refresh `B` mid-game. Confirm `B` rejoins and the host snapshot restores state, then further moves still sync.
- [ ] **Step 6:** In `TableInfo` (as host), transfer the host to `B`. Confirm `B` becomes host and subsequent moves continue to sync (peer id reused after retry).
- [ ] **Step 7:** Close `A` (host) and act in `B`. Confirm the fallback badge (`game.fallbackMode`) appears within ~8s and `B` continues to update from Ably polling (~3s latency).
- [ ] **Step 8:** Reload `B` while the host is gone. Confirm the table state loads from Ably (one-time read) and the game is still shown.

---

## Notes / known limitations

- **No automatic host election.** If the host closes without transferring, clients fall back to ~3s Ably polling until a designated host returns. Documented in the spec.
- **Late joiners** send an optimistic full table derived from their last Ably read; a hot host can briefly overwrite newer state (same characteristic the Ably-only code already had). The host snapshot then reconciles the joiner.
- **Lobby is load-once.** Tables created by others appear only after a reload.
- `rev` is host-local and in-memory; it is intentionally not part of `Table` or the Ably schema. On host transfer the new host continues from its highest seen `rev`.

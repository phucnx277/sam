# Peer-only (no-Ably) Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transport mode that skips Ably entirely so a host can create a table locally and others join it over PeerJS via QR/link, with no Ably API key.

**Architecture:** Add a persisted `mode: "ably" | "peer"` to the `useAppData` Zustand store. Ably-only calls (`createTable` map write, `persistTableToAbly`, polling) are guarded by mode. In peer mode the host's tables are persisted in `sam.tables`; a joining device knows only `tblId` + `tblPw` from the link, connects to the host peer `sam-<tableId>`, and the host validates password/limit over the PeerJS `hello` handshake, replying `snapshot` or a new `reject` message.

**Tech Stack:** React 19, TypeScript, Vite 7, Zustand, PeerJS, Ably LiveObjects, Tailwind v4.

---

## Notes for the executor

- **There is no test framework and no test files in this repo.** Do **not** run `npm test` or write test files (per `AGENTS.md`). Each task's verification is `npm run build` (which runs `tsc -b`) and `npm run lint`.
- **The pre-commit hook mutates every commit** (`.husky/pre-commit`): it runs `npm run build`, runs `./bump-version.sh` (bumps `package.json` and `npm install`), then `git add -u`. So commit steps are slow and always change the version. Always `git add` explicitly before committing. Do not use `--no-verify` for code commits.
- **Pre-existing unrelated change:** `src/components/Tables/Tables.tsx` already has an uncommitted one-line `min-w-[25rem]` → `min-w-[20rem]` change. Leave it in place. Since Task 7 also edits this file, the final commit for that task will include it; do not revert it.
- Path aliases: use `@hooks/*` and `@logic/*` (or relative imports). Do **not** use the bare `@/*` alias — it fails `tsc`.
- Doc-only commits (not part of this plan) should use `git commit --no-verify`.

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/logic/table.ts` | Game-domain join validation | Add `JoinRejectReason`, `validateJoin`; refactor `enterTable` |
| `src/logic/peer.ts` | PeerJS message envelope | Add `hello.password`, `reject` msg, parser updates |
| `src/logic/util.ts` | Shared pure helpers | Add `parseTableLink` |
| `src/hooks/usePeerData.ts` | PeerJS lifecycle store | Password in `hello`, `onReject`, `joinHost(tableId, …)` |
| `src/hooks/useAppData.ts` | App/transport store | Mode model, peer init/join, `sam.tables`, guards, errors |
| `src/locales/vi.ts`, `src/locales/en.ts` | i18n dictionaries | New keys (`vi` is source of truth) |
| `src/components/Credentials/InitAppData.tsx` | Setup screen | "Play without Ably" button + `?mode=peer` |
| `src/components/Tables/ShareTable.tsx` | Share modal | Peer join URL |
| `src/components/Tables/TableInfo.tsx` | Table info modal | Hide Ably key row in peer mode |
| `src/components/Tables/EnterTable.tsx` | Password prompt | Optional peer (`tableId`) variant |
| `src/components/Tables/Tables.tsx` | Lobby | Link routing, peer auto-join, mode switch |
| `src/components/Lobby/Lobby.tsx` | Root switcher | Render peer errors |

## Task dependency order

Tasks 1 → 2 → 3 must land in order (each keeps `tsc` green). Task 4 (i18n) is independent and can be done any time before Tasks 5–7. Tasks 5, 6, 7 are independent of each other after Task 4.

---

### Task 1: Logic layer — join validation, peer protocol, link parser

**Files:**
- Modify: `src/logic/table.ts`
- Modify: `src/logic/peer.ts`
- Modify: `src/logic/util.ts`

- [ ] **Step 1: Add `JoinRejectReason` and `validateJoin` to `src/logic/table.ts`, and refactor `enterTable`**

Add this type and function immediately before `export const enterTable` (after `export const newTable`):

```ts
export type JoinRejectReason = "password" | "full";

export const validateJoin = (
  table: Table,
  player: Player,
  password: string,
): JoinRejectReason | null => {
  if (table.game.players.some((item) => item.id === player.id)) {
    return null;
  }
  if (
    table.password &&
    player.id !== table.hostId &&
    password !== table.password
  ) {
    return "password";
  }
  if (table.game.players.length >= table.playerLimit) {
    return "full";
  }
  return null;
};
```

Now replace the whole `enterTable` function with this version, which delegates the checks to `validateJoin`:

```ts
export const enterTable = (
  params: EnterTableParams,
): { error: Error | null; table: Table | null } => {
  const table = { ...params.table };

  const reason = validateJoin(table, params.player, params.password);
  if (reason) {
    return {
      error: new Error(
        reason === "password"
          ? t("error.passwordIncorrect")
          : t("error.tableFull", { limit: table.playerLimit }),
      ),
      table,
    };
  }

  if (
    table.game.players.findIndex((item) => item.id === params.player.id) === -1
  ) {
    const tblPlayer = table.players.find(
      (item) => item.id === params.player.id && item.isRemoved,
    );
    const newGp = newGamePlayer(params.player);

    if (tblPlayer) {
      tblPlayer.isRemoved = false;
      newGp.chipCount = tblPlayer.chipCount;
    }

    table.game.players = [...table.game.players, newGp];
  }

  if (table.players.findIndex((item) => item.id === params.player.id) === -1) {
    table.players = [
      ...table.players,
      {
        id: params.player.id,
        name: params.player.name,
        chipCount: 0,
      },
    ];
  }

  return {
    error: null,
    table,
  };
};
```

- [ ] **Step 2: Add password + reject to the peer envelope in `src/logic/peer.ts`**

Add the import at the top (after the existing blank first line / before `export const HOST_PEER_PREFIX`):

```ts
import type { JoinRejectReason } from "./table";
```

Replace the `PeerMsg` type with:

```ts
export type PeerMsg =
  | { type: "hello"; playerId: string; name: string; password: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string }
  | { type: "reject"; reason: JoinRejectReason };
```

In `parsePeerMsg`, replace the `case "hello":` block with one that carries `password`, and add a `case "reject":` before `default:`:

```ts
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
```

```ts
    case "reject":
      if (msg.reason !== "password" && msg.reason !== "full") {
        return null;
      }
      return { type: "reject", reason: msg.reason };
```

- [ ] **Step 3: Add `parseTableLink` to `src/logic/util.ts`**

Append this to the end of `src/logic/util.ts`:

```ts
export type TableLinkMode = "ably" | "peer";

export type TableLink = {
  mode: TableLinkMode;
  tableId: string;
  password: string | null;
  apiKey: string | null;
};

export const parseTableLink = (link: string): TableLink | null => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  const tableId = url.searchParams.get("tblId");
  if (!tableId) return null;

  const password = url.searchParams.get("tblPw");
  const apiKey = url.searchParams.get("apiKey");
  const mode = url.searchParams.get("mode");

  if (mode === "peer" && !apiKey) {
    return { mode: "peer", tableId, password, apiKey: null };
  }
  if (apiKey) {
    return { mode: "ably", tableId, password, apiKey };
  }
  return null;
};
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds (`tsc -b` passes, `vite build` completes).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/logic/table.ts src/logic/peer.ts src/logic/util.ts
git commit -m "feat(peer): add join validation, peer reject message, and table link parser"
```

---

### Task 2: `usePeerData` — password handshake and reject handling

**Files:**
- Modify: `src/hooks/usePeerData.ts`
- Modify: `src/hooks/useAppData.ts` (call-site compatibility only)

- [ ] **Step 1: Update imports and `PeerCallbacks` / action types in `src/hooks/usePeerData.ts`**

Add `validateJoin` and `JoinRejectReason` to the imports. Replace the existing `@logic/peer` import block with:

```ts
import {
  CLIENT_PEER_PREFIX,
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";
import { validateJoin, type JoinRejectReason } from "@logic/table";
```

Replace `PeerCallbacks` with:

```ts
export type PeerCallbacks = {
  onSnapshot: (table: Table, rev: number) => void;
  onUpdate: (table: Table, rev: number) => void;
  onJoin: (player: Player, table: Table) => Table | null;
  onFallback: (fallback: boolean) => void;
  onReject: (reason: JoinRejectReason) => void;
};
```

Change the `joinHost` entry in the `PeerDataState` type from:

```ts
  joinHost: (table: Table, player: Player, cb: PeerCallbacks) => void;
```

to:

```ts
  joinHost: (
    tableId: string,
    player: Player,
    password: string,
    cb: PeerCallbacks,
    baseTable?: Table,
  ) => void;
```

- [ ] **Step 2: Validate the password in `startHost`'s `hello` branch**

Inside `startHost`, in `peer.on("connection", …)` → `conn.on("data", …)`, replace the `if (msg.type === "hello") { … }` block's beginning. The block currently starts:

```ts
          if (msg.type === "hello") {
            const state = get();
            if (!state.clientConns.includes(conn)) {
              set({ clientConns: [...state.clientConns, conn] });
            }
            const joining: Player = { id: msg.playerId, name: msg.name };
            let latest = get().latestTable ?? table;
            const merged = get().callbacks?.onJoin(joining, latest);
```

Replace those lines with:

```ts
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
              try {
                conn.close();
              } catch {
                /* noop */
              }
              set({
                clientConns: get().clientConns.filter((c) => c !== conn),
              });
              return;
            }

            const merged = get().callbacks?.onJoin(joining, latest);
```

The rest of the `hello` branch (the `if (merged && merged !== latest) { … }` and `safeSend(conn, { type: "snapshot", … })`) stays unchanged.

- [ ] **Step 3: Change `joinHost` to take `tableId` + `password`, and handle `reject`**

Replace the entire `joinHost: (table, player, cb) => { … }` action with:

```ts
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
```

- [ ] **Step 4: Update `src/hooks/useAppData.ts` call sites so the build stays green**

Add an `onReject` member to the `bridge` object (temporary no-op; Task 3 wires it to state). Insert after the `onFallback` entry in `const bridge: PeerCallbacks = { … }`:

```ts
  onReject: (reason) => {
    console.warn("[peer] join rejected", reason);
  },
```

Change `startPeerSession` to accept and forward a password:

```ts
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
```

Update the two callers in the `useAppData` hook body:

In `createTable`, change `startPeerSession(table, params.player);` to `startPeerSession(table, params.player, params.password);`

In `enterTable`, change `startPeerSession(table, params.player);` to `startPeerSession(table, params.player, params.password);`

Update `reconcilePeerRole`'s client branch: change `peer.joinHost(table, localPlayer, bridge);` to:

```ts
    peer.joinHost(table.id, localPlayer, table.password, bridge, table);
```

- [ ] **Step 5: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePeerData.ts src/hooks/useAppData.ts
git commit -m "feat(peer): send password in handshake and surface host rejections"
```

---

### Task 3: `useAppData` — transport mode, peer join, persistence, errors

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Add imports and module constants/helpers**

At the top of `src/hooks/useAppData.ts`, extend the `@logic/table` import to include the reject type:

```ts
import {
  newTable,
  enterTable as joinTable,
  addTablePlayer,
  type EnterTableParams,
  type NewTableParams,
  type JoinRejectReason,
} from "@logic/table";
```

After the existing `const POLL_INTERVAL_MS = 3000;` line, add:

```ts
const LS_MODE = "sam.mode";
const LS_PEER_TABLES = "sam.tables";

export type TransportMode = "ably" | "peer";
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
```

- [ ] **Step 2: Extend the store type, initial state, and actions**

Replace the `const useAblyStore = create<{ … }>((set, get) => ({ … }))` type literal — specifically the type block:

```ts
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
```

with:

```ts
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
  tables: getStoredMode() === "peer" ? getPeerTables() : [],
  playingTable: null,
  isPeerFallback: false,
  mode: getStoredMode(),
  peerError: null,
  initAbly: async (apiKey: string): Promise<{ error: Error | null }> => {
```

- [ ] **Step 3: Persist mode in the Ably init, and add the peer actions**

In `initAbly` (the renamed `init`), inside the success `set({ … })` add `mode: "ably"` and `peerError: null`. The success block currently is:

```ts
      set({
        client,
        channel,
        tablesMap,
        tables: parseTables(tablesMap.entries()),
        playingTable: null,
        isPeerFallback: false,
      });
      storeApiKey(normalizedApiKey);
```

Replace it with:

```ts
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
```

- [ ] **Step 4: Make `setPlayingTable` mode-aware and add the new peer actions**

Replace the existing `setPlayingTable` and `unsetPlayingTable` entries with:

```ts
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
    if (get().mode === "peer") {
      savePeerTables(get().tables);
    }
    return null;
  },
  unsetPlayingTable: () => {
    set({ playingTable: null });
  },
  initPeer: () => {
    usePeerData.getState().stop();
    stopPolling();
    storeMode("peer");
    set({
      mode: "peer",
      client: null,
      channel: null,
      tablesMap: null,
      tables: getPeerTables(),
      playingTable: null,
      isPeerFallback: false,
      peerError: null,
    });
  },
  switchToAbly: () => {
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
```

- [ ] **Step 5: Update the callbacks bridge**

Replace the `const bridge: PeerCallbacks = { … }` declaration with:

```ts
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
```

- [ ] **Step 6: Guard `reconcilePeerRole`, `applyRemoteTable`, `startPolling`, and `persistTableToAbly`**

Replace `reconcilePeerRole`'s first line body by adding a peer-mode early return at the top:

```ts
function reconcilePeerRole(table: Table): void {
  if (useAblyStore.getState().mode === "peer") return;

  const localPlayer = useLocalPlayer.getState().localPlayer;
```

(leave the rest of the function unchanged).

Replace the beginning of `applyRemoteTable` with a peer branch:

```ts
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
```

(keep the existing Ably body that follows, starting at `useAblyStore.setState((state) => { … });`).

Replace `startPolling` with a guarded version:

```ts
function startPolling(tableId: string): void {
  if (useAblyStore.getState().mode === "peer") return;
  stopPolling();
  pollTimer = window.setInterval(() => {
    void refreshTableFromAbly(tableId);
  }, POLL_INTERVAL_MS);
}
```

At the very start of `persistTableToAbly`, add the peer early-return:

```ts
async function persistTableToAbly(data: Table): Promise<Error | null> {
  if (useAblyStore.getState().mode === "peer") return null;
  const { channel } = useAblyStore.getState();
```

- [ ] **Step 7: Branch `createTable` and `removeTable` on mode**

Inside `createTable`, replace the `try { … }` body's first lines:

```ts
      try {
        const table = newTable(params);
        const tm = await channel!.objects.createMap(stringifyValues(table));
        await tablesMap!.set(table.id, tm);
        setPlayingTable(table);
        startPeerSession(table, params.player, params.password);
      } catch (err) {
```

with:

```ts
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
```

Replace the `removeTable` body with a peer branch:

```ts
  const removeTable = useCallback(
    async (tableId: string): Promise<Error | null> => {
      if (useAblyStore.getState().mode === "peer") {
        const tables = useAblyStore
          .getState()
          .tables.filter((item) => item.id !== tableId);
        savePeerTables(tables);
        useAblyStore.setState({ tables });
        if (usePeerData.getState().tableId === tableId) {
          usePeerData.getState().stop();
          stopPolling();
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
          unsetPlayingTable();
        }
      } catch (err) {
        error = err as Error;
      }
      return error;
    },
    [tablesMap, unsetPlayingTable],
  );
```

- [ ] **Step 8: Update the hook's destructuring, `isInitialized`, and return value**

Replace the `useAppData` hook's destructuring and return with:

```ts
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
```

Keep the `isUpdatingTable` state and the existing `createTable`/`updateTable`/`enterTable`/`leaveTable`/`removeTable` definitions unchanged (they now read `mode` via `useAblyStore.getState()` internally).

Replace the `return { … }` object with:

```ts
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
    isUpdatingTable,
    removeTable,
    leaveTable,
    getApiKey,
  };
};
```

- [ ] **Step 9: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat(peer): add peer-only transport mode with local table persistence"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add keys to `src/locales/vi.ts`**

Add `credentials.playWithoutAbly` after `"credentials.checking"`:

```ts
  "credentials.playWithoutAbly": "Chơi không cần Ably (chỉ PeerJS)",
```

Add `lobby.connectWithAbly` after `"lobby.createTable"`:

```ts
  "lobby.connectWithAbly": "Kết nối Ably",
```

Add the two error keys after `"error.cannotRemoveHost"`:

```ts
  "error.peerFull": "Bàn đã đầy",
  "error.peerUnreachable": "Không kết nối được tới chủ bàn",
```

- [ ] **Step 2: Add the same keys to `src/locales/en.ts`**

Add after `"credentials.checking"`:

```ts
  "credentials.playWithoutAbly": "Play without Ably (PeerJS only)",
```

Add after `"lobby.createTable"`:

```ts
  "lobby.connectWithAbly": "Connect with Ably",
```

Add after `"error.cannotRemoveHost"`:

```ts
  "error.peerFull": "The table is full",
  "error.peerUnreachable": "Could not reach the table host",
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds. If it fails with a missing-key error in `en.ts`, a key was added to `vi.ts` but not `en.ts` — add the missing key.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat(i18n): add peer-only mode strings"
```

---

### Task 5: Setup screen — "Play without Ably" + `?mode=peer`

**Files:**
- Modify: `src/components/Credentials/InitAppData.tsx`

- [ ] **Step 1: Consume `initPeer` and handle `?mode=peer`**

Change the hook destructure at the top of the component:

```ts
  const { init, initPeer, getApiKey } = useAppData();
```

Replace the first `useEffect` (the URL one) with:

```tsx
  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get("mode") === "peer") {
      url.searchParams.delete("mode");
      window.history.replaceState({}, "", url.toString());
      initPeer();
      return;
    }

    let apiKey = url.searchParams.get("apiKey");
    apiKey = getApiKey("original", apiKey);
    setApiKey(apiKey);

    setTimeout(() => {
      if (url.searchParams.has("apiKey")) {
        url.searchParams.delete("apiKey");
        window.history.replaceState({}, "", url.toString());
      }
    }, 100);
  }, []);
```

- [ ] **Step 2: Add the secondary button**

In the form's JSX, after the submit `<button type="submit" …>…</button>`, add:

```tsx
      <button
        type="button"
        className="mt-4 text-sm text-cyan-600 underline"
        disabled={isInitializing}
        onClick={() => initPeer()}
      >
        {t("credentials.playWithoutAbly")}
      </button>
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no errors. (`InitAppData.tsx` already disables `react-hooks/exhaustive-deps`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/Credentials/InitAppData.tsx
git commit -m "feat(credentials): add play-without-Ably option"
```

---

### Task 6: Share link, table info, and the peer password prompt

**Files:**
- Modify: `src/components/Tables/ShareTable.tsx`
- Modify: `src/components/Tables/TableInfo.tsx`
- Modify: `src/components/Tables/EnterTable.tsx`

- [ ] **Step 1: Mode-aware join URL in `src/components/Tables/ShareTable.tsx`**

Change the hook destructure:

```tsx
  const { getApiKey, mode } = useAppData();
```

Replace the `joinUrl` line with:

```tsx
  const joinUrl =
    mode === "peer"
      ? `${window.location.origin}?mode=peer&tblId=${props.table.id}&tblPw=${props.table.password}`
      : `${window.location.origin}?apiKey=${getApiKey("encoded")}&tblId=${props.table.id}&tblPw=${props.table.password}`;
```

- [ ] **Step 2: Hide the Ably key row in peer mode in `src/components/Tables/TableInfo.tsx`**

Change the hook destructure:

```tsx
  const { playingTable, getApiKey, updateTable, isUpdatingTable, mode } =
    useAppData();
```

Wrap the existing API-key row (`<div className="flex align-center justify-between gap-x-2 mt-2 py-2 border-y border-y-gray-300"> … </div>` containing `table.apiKeyLabel`) in a mode guard:

```tsx
        {mode !== "peer" && (
          <div className="flex align-center justify-between gap-x-2 mt-2 py-2 border-y border-y-gray-300">
            <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
              <span>{t("table.apiKeyLabel")}</span>
              <span className="ml-1 font-semibold">
                {apiKey.slice(0, 6)}...{apiKey.slice(-6)}
              </span>
            </div>
            <button
              className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
              onClick={() => copy("key")}
            >
              {copied.key ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        )}
```

- [ ] **Step 3: Add the peer variant to `src/components/Tables/EnterTable.tsx`**

Change the props type and hook destructure:

```tsx
const EnterTable = (props: {
  table?: Table;
  tableId?: string;
  close: () => void;
}) => {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const { localPlayer } = useLocalPlayer();
  const { enterTable, joinPeerTable } = useAppData();
  const isPeer = !props.table;
```

Guard the auto-join effect so it only runs for the local-table (Ably / host re-open) path. Change the first line inside the effect:

```tsx
  useEffect(() => {
    if (!localPlayer || !props.table) return;
    const table = props.table;
    const url = new URL(window.location.href);
    let password = url.searchParams.get("tblPw") || "";
    const alreadyJoined = table.game?.players?.some(
      (gp) => gp.id === localPlayer.id,
    );
    if (alreadyJoined) {
      password = table.password;
    }
    if (alreadyJoined || password || !table.password) {
      (async () => {
        const error = await enterTable({
          table,
          player: localPlayer,
          password,
        });
        if (error) {
          alert(error.message);
        }
        props.close();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.table]);
```

Replace the `submit` handler with:

```tsx
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || !localPlayer) return;
    if (isPeer) {
      joinPeerTable(props.tableId!, password);
      props.close();
      return;
    }
    const error = await enterTable({
      table: props.table!,
      player: localPlayer,
      password,
    });
    if (error) {
      alert(error.message);
    }
    props.close();
  };
```

Replace the title block in the JSX:

```tsx
        <div className="text-lg text-center">
          <span>{props.table ? t("table.tableLabel") : t("table.idLabel")}</span>
          <span className="font-semibold">
            {props.table ? props.table.name : props.tableId}
          </span>
        </div>
```

- [ ] **Step 4: Add the `table.idLabel` key (used in Step 3)**

In `src/locales/vi.ts`, after `"table.tableLabel": "Bàn: ",` add:

```ts
  "table.idLabel": "Mã bàn: ",
```

In `src/locales/en.ts`, after `"table.tableLabel": "Table: ",` add:

```ts
  "table.idLabel": "Table ID: ",
```

- [ ] **Step 5: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Tables/ShareTable.tsx src/components/Tables/TableInfo.tsx src/components/Tables/EnterTable.tsx src/locales/vi.ts src/locales/en.ts
git commit -m "feat(tables): share and enter peer-only tables by link"
```

---

### Task 7: Lobby routing, peer auto-join, mode switch, and error display

**Files:**
- Modify: `src/components/Tables/Tables.tsx`
- Modify: `src/components/Lobby/Lobby.tsx`

- [ ] **Step 1: Update imports and add peer state in `src/components/Tables/Tables.tsx`**

Add `parseTableLink` to the `@logic/util` import:

```tsx
import { decodeApiKey, isAblyApiKeyValid, parseTableLink } from "@logic/util";
```

Change the hook destructure in `Tables`:

```tsx
  const {
    tables,
    playingTable,
    removeTable,
    init,
    initPeer,
    joinPeerTable,
    switchToAbly,
    mode,
    getApiKey,
  } = useAppData();
```

Add a state for the peer password prompt next to `enteringTable`:

```tsx
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);
  const [enteringPeerTableId, setEnteringPeerTableId] = useState<string | null>(
    null,
  );
  const autoLinkedRef = useRef(false);
```

Add `useRef` to the React import at the top:

```tsx
import { useEffect, useRef, useState, lazy, Suspense } from "react";
```

- [ ] **Step 2: Replace the link helpers with a single mode-aware `applyLink`**

Delete the existing `enterTableWithLink` function and replace `handlePasteLink` and `handleScan` with:

```tsx
  const applyLink = async (link: string): Promise<boolean> => {
    const parsed = parseTableLink(link);
    if (!parsed) return false;

    if (parsed.mode === "peer") {
      if (mode !== "peer") {
        initPeer();
      }
      const localTable = getTables().find((item) => item.id === parsed.tableId);
      if (localTable) {
        setEnteringTable(localTable);
        return true;
      }
      if (parsed.password !== null) {
        joinPeerTable(parsed.tableId, parsed.password);
        return true;
      }
      setEnteringPeerTableId(parsed.tableId);
      return true;
    }

    const key = parsed.apiKey ?? "";
    const isSameKey = key === getApiKey("encoded");
    if (!isSameKey) {
      let isValidScannedKey = false;
      try {
        isValidScannedKey = isAblyApiKeyValid(decodeApiKey(key));
      } catch {
        isValidScannedKey = false;
      }
      if (!isValidScannedKey) return false;

      const { error } = await init(key);
      if (error) {
        alert(error.message);
        return false;
      }
    }

    const currentUrl = new URL(window.location.href);
    if (parsed.password !== null) {
      currentUrl.searchParams.set("tblPw", parsed.password);
    } else {
      currentUrl.searchParams.delete("tblPw");
    }
    window.history.replaceState({}, "", currentUrl.toString());

    const table = getTables().find((item) => item.id === parsed.tableId);
    if (!table) return false;
    setEnteringTable(table);
    return true;
  };

  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert(t("table.linkInvalid"));
        return;
      }
      if (!(await applyLink(clipboardText))) {
        alert(t("table.linkInvalid"));
      }
    } catch {
      /* empty */
    }
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);
    if (!(await applyLink(payload))) {
      alert(t("table.linkInvalid"));
    }
  };
```

- [ ] **Step 3: Replace the two link effects with mode-aware effects**

Replace the existing `useEffect(() => { enterTableWithLink(window.location.href, tables); }, [tables]);` with:

```tsx
  // Peer links: rejoin once, even before any local tables exist.
  useEffect(() => {
    if (mode !== "peer" || autoLinkedRef.current) return;
    autoLinkedRef.current = true;
    void applyLink(window.location.href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Ably deep links: resolve once the table list has loaded.
  useEffect(() => {
    if (mode === "peer") return;
    const parsed = parseTableLink(window.location.href);
    if (parsed?.mode !== "ably") return;
    const table = tables.find((item) => item.id === parsed.tableId);
    if (table) {
      setEnteringTable(table);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, mode]);
```

- [ ] **Step 4: Render the peer Connect-with-Ably button and the peer password prompt**

Inside the `{!playingTable && (<> … </>)}` block, after the paste-link button (the `onClick={handlePasteLink}` button), add:

```tsx
            {mode === "peer" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  className="text-sm text-cyan-600 underline"
                  onClick={switchToAbly}
                >
                  {t("lobby.connectWithAbly")}
                </button>
              </div>
            )}
```

After the existing `{!!enteringTable && ( <EnterTable … /> )}` block, add:

```tsx
          {!!enteringPeerTableId && (
            <EnterTable
              tableId={enteringPeerTableId}
              close={() => setEnteringPeerTableId(null)}
            />
          )}
```

- [ ] **Step 5: Render peer errors in `src/components/Lobby/Lobby.tsx`**

Replace the whole file with:

```tsx
import { useEffect } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import type { TranslationKey } from "@logic/i18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import Credentials from "../Credentials/Credentials";
import Tables from "../Tables/Tables";
import AutoFadeout from "../common/AutoFadeout";

const peerErrorKey = (reason: string): TranslationKey => {
  if (reason === "password") return "error.passwordIncorrect";
  if (reason === "full") return "error.peerFull";
  return "error.peerUnreachable";
};

const Lobby = () => {
  const { isInitialized, peerError, clearPeerError } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const { t } = useI18n();

  useEffect(() => {
    if (!peerError) return;
    const id = window.setTimeout(clearPeerError, 4000);
    return () => window.clearTimeout(id);
  }, [peerError, clearPeerError]);

  return (
    <div className="h-full w-full max-w-full flex items-center justify-center">
      {!(isInitialized && localPlayer) && <Credentials />}
      {isInitialized && <Tables />}
      {!!peerError && (
        <AutoFadeout ts={Date.now()}>
          <div className="bg-red-600 text-white px-4 py-2 rounded">
            {t(peerErrorKey(peerError))}
          </div>
        </AutoFadeout>
      )}
    </div>
  );
};

export default Lobby;
```

- [ ] **Step 6: Verify it compiles and lints**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Tables/Tables.tsx src/components/Lobby/Lobby.tsx
git commit -m "feat(lobby): route peer-only links and surface peer errors"
```

---

## Manual verification (after all tasks)

Run `npm run build` and `npm run lint` once more, then do a two-device session (two browser profiles or a phone + laptop):

1. **Peer host:** choose "Play without Ably", create a table, open Share → confirm the QR/URL contains `mode=peer` and no `apiKey`.
2. **Peer join (wrong password):** scan/paste a peer link with a wrong `tblPw` → the red "Password is incorrect" toast appears; the device stays in the lobby.
3. **Peer join (correct password):** scan/paste the real link → the client enters the table and can play a turn.
4. **Reloads:** refresh the host (table re-hosts from `sam.tables`) and refresh the client (auto-rejoins from the URL) → both return to the game.
5. **Cross-mode link:** open the peer link on a device already in Ably mode → it switches to peer mode and joins without asking for a key.
6. **No Ably:** confirm no Ably Realtime client is constructed in peer mode (no Ably network calls; `mode === "peer"`). Optionally break the Ably key and confirm peer mode is unaffected.
7. **Unreachable PeerJS:** temporarily point `VITE_PEER_HOST`/`VITE_PEER_PATH` at a bad server (or stop the PeerJS server), attempt a peer join → "Could not reach the table host" appears and no Ably polling starts.

## Self-review notes (already applied)

- **Spec coverage:** mode toggle (Tasks 3, 5), persistence `sam.mode`/`sam.tables` (Task 3), peer handshake join (Tasks 1, 2, 3), share/link (Tasks 1, 6), cross-mode switch (Tasks 3, 5, 7), error surfacing (Tasks 3, 7), i18n (Tasks 4, 6), guards so Ably is never touched in peer mode (Task 3).
- **Type consistency:** `JoinRejectReason` is defined once in `logic/table.ts` and imported by `peer.ts`, `usePeerData.ts`, and `useAppData.ts`. `parseTableLink` returns `TableLink`. `joinHost` consistently takes `(tableId, player, password, cb, baseTable?)`. The store exposes both `init` (alias) and `initAbly`.
- **No placeholders:** every code step contains the full replacement content.

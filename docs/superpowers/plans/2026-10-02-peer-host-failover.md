# Peer-Mode Host Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a peer-mode host goes offline, connected players unanimously elect one of themselves as the new host, the game resumes, and the old host's turns are skipped until they rejoin as a normal player.

**Architecture:** Client peer IDs become deterministic (`sam-c-<playerId>`) so players can reach each other directly once the relay host is gone. A `hostEpoch` fencing token on `Table` orders host generations; every promotion increments it. After a grace period with the host unreachable, clients run a mesh-based `present`/`vote` election and the unanimous winner claims the existing `sam-<tableId>` host peer id, marks the outgoing host `isAway` (hand preserved, turns skipped), and broadcasts a fresh snapshot. The returning old host gets the higher-epoch snapshot and rejoins as a client.

**Tech Stack:** React 19, TypeScript, Vite 7, Zustand, PeerJS, Tailwind v4. No test framework — verification is `npm run build` (tsc) + `npm run lint` + manual browser checks.

---

## File Structure

- `src/type.d.ts` — add `Table.hostEpoch`, `GamePlayer.isAway`.
- `src/logic/peer.ts` — deterministic `clientPeerId`, `present`/`vote` messages + parsing.
- `src/logic/table.ts` — `hostEpoch` init, pure `promoteHost` and `resumePlayer`.
- `src/logic/game.ts` — exclude `isAway` players from turn rotation; `isPlayerAway`.
- `src/hooks/usePeerData.ts` — grace-based host-loss detection, client mesh election, host claim, epoch guards.
- `src/hooks/useAppData.ts` — expose election state + `castVote`; resume away player on join; epoch guard.
- `src/components/GamePlayer/HostElection.tsx` — election overlay (new).
- `src/components/Tables/PlayingTable.tsx` — render overlay (new import/usage).
- `src/locales/vi.ts`, `src/locales/en.ts` — election strings.

---

### Task 1: Data model and pure logic

**Files:**
- Modify: `src/type.d.ts`
- Modify: `src/logic/peer.ts`
- Modify: `src/logic/table.ts`
- Modify: `src/logic/game.ts`

- [ ] **Step 1: Add model fields**

In `src/type.d.ts`, add to `GamePlayer` (after `paidVillage: boolean;`):

```ts
  isAway?: boolean;
```

And to `Table` (after `hostId: string;`):

```ts
  hostEpoch: number;
```

- [ ] **Step 2: Deterministic client id + election messages in `src/logic/peer.ts`**

Replace `randomClientPeerId` with:

```ts
export const clientPeerId = (playerId: string): string =>
  `${CLIENT_PEER_PREFIX}-${playerId}`;
```

Extend the `PeerMsg` union:

```ts
export type PeerMsg =
  | { type: "hello"; playerId: string; name: string; password: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string }
  | { type: "reject"; reason: JoinRejectReason }
  | { type: "present"; playerId: string; epoch: number; round: number }
  | {
      type: "vote";
      voterId: string;
      candidateId: string;
      epoch: number;
      round: number;
    };
```

In `parsePeerMsg`, add cases before `default`:

```ts
    case "present":
      if (
        typeof msg.playerId !== "string" ||
        typeof msg.epoch !== "number" ||
        typeof msg.round !== "number"
      ) {
        return null;
      }
      return {
        type: "present",
        playerId: msg.playerId,
        epoch: msg.epoch,
        round: msg.round,
      };
    case "vote":
      if (
        typeof msg.voterId !== "string" ||
        typeof msg.candidateId !== "string" ||
        typeof msg.epoch !== "number" ||
        typeof msg.round !== "number"
      ) {
        return null;
      }
      return {
        type: "vote",
        voterId: msg.voterId,
        candidateId: msg.candidateId,
        epoch: msg.epoch,
        round: msg.round,
      };
```

- [ ] **Step 3: `hostEpoch` init + promotion helpers in `src/logic/table.ts`**

In `newTable`, add `hostEpoch: 0,` after `hostId: params.player.id,`.

Append these exports:

```ts
export const promoteHost = (table: Table, winnerId: string): Table => {
  const oldHostId = table.hostId;
  const game: Game = {
    ...table.game,
    players: table.game.players.map((gp) =>
      gp.id === oldHostId ? { ...gp, isAway: true } : gp,
    ),
  };

  const active = game.players.filter((gp) => gp.isReady && !gp.isAway);
  if (active.length >= 2 && !active.some((gp) => gp.id === game.currentPlayerId)) {
    const curIdx = game.players.findIndex(
      (gp) => gp.id === game.currentPlayerId,
    );
    let nextId = active[0].id;
    for (let i = 1; i <= game.players.length; i++) {
      const cand = game.players[(curIdx + i) % game.players.length];
      if (active.some((gp) => gp.id === cand.id)) {
        nextId = cand.id;
        break;
      }
    }
    game.currentPlayerId = nextId;
    game.turnStartTs = Date.now();
    game.turnEndTs =
      game.turnTimeout > 0
        ? game.turnStartTs + game.turnTimeout * 1000
        : -1;
  }

  return {
    ...table,
    hostId: winnerId,
    hostEpoch: (table.hostEpoch ?? 0) + 1,
    updatedAt: Date.now(),
    game,
  };
};

export const resumePlayer = (table: Table, playerId: string): Table => {
  const gp = table.game.players.find((item) => item.id === playerId);
  if (!gp || !gp.isAway) return table;
  return {
    ...table,
    updatedAt: Date.now(),
    game: {
      ...table.game,
      players: table.game.players.map((item) =>
        item.id === playerId ? { ...item, isAway: false } : item,
      ),
    },
  };
};
```

- [ ] **Step 4: Skip away players in turn rotation in `src/logic/game.ts`**

Add near `isPlayerPassedTurn`:

```ts
export const isPlayerAway = (player?: GamePlayer | null): boolean =>
  !!player?.isAway;
```

In `findNextPlayerId` change the filter:

```ts
    game.players.filter((item) => item.isReady && !item.isAway),
```

In `findNextAutoPlayer` change the filter:

```ts
    game.players.filter((item) => item.isReady && !item.isAway),
```

In `isEveryonePassed` change the filter predicate:

```ts
        item.isReady &&
        !item.isAway &&
        item.lastPlayedRound === game.round &&
```

In the `startGame` `checkState`, change `disabled`:

```ts
      const disabled =
        !currentPlayer.isReady ||
        currentPlayer.isAway ||
        playingTable.game.players.filter((gp) => gp.isReady && !gp.isAway)
          .length < 2;
```

- [ ] **Step 5: Verify the pure logic compiles**

Run: `npm run build`
Expected: PASS (no type errors). Do not commit yet — Task 5 commits code; this task's changes are committed in Task 2's commit only if a subagent boundary requires it. If committing per task, stage only these four files.

- [ ] **Step 6: Commit**

```bash
git add src/type.d.ts src/logic/peer.ts src/logic/table.ts src/logic/game.ts
git commit -m "feat(peer): add host epoch, away seats, and election messages"
```

Note: the pre-commit hook runs `npm run build` and bumps the patch version. Let it.

---

### Task 2: Peer election protocol in `usePeerData`

**Files:**
- Modify: `src/hooks/usePeerData.ts`

This task rewrites the client side of `joinHost` so the host connection is retried on the same peer (preserving the election mesh), adds grace-based election, and adds the mesh vote.

- [ ] **Step 1: Update imports and constants**

Replace the import from `@logic/peer` and the constants block:

```ts
import {
  clientPeerId,
  parsePeerMsg,
  shouldApplyRevision,
  tablePeerId,
  type PeerMsg,
} from "@logic/peer";
import {
  promoteHost,
  validateJoin,
  type JoinRejectReason,
} from "@logic/table";

const HOST_RETRY_MS = 1500;
const CONNECT_TIMEOUT_MS = 8000;
const MAX_PEER_RETRIES = 4;
const HOST_GRACE_MS = 10000;
const ELECTION_ROUND_MS = 30000;
```

Add module state after `connectAttempt`:

```ts
let wasConnected = false;
let graceTimer: number | null = null;
let electionTimer: number | null = null;
let electionConns: Map<string, DataConnection> = new Map();
```

- [ ] **Step 2: Add the election state type and store fields**

Add above `type PeerDataState`:

```ts
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
```

Add to `PeerDataState` type:

```ts
  selfPlayer: Player | null;
  hostPassword: string;
  election: HostElectionState | null;
```

Add to the store initial object after `callbacks: null,`:

```ts
    selfPlayer: null,
    hostPassword: "",
    election: null,
```

Add to the `PeerDataState` type and the store:

```ts
  castVote: (candidateId: string) => void;
```

- [ ] **Step 3: Timer + election cleanup helpers**

In `clearTimers`, also clear the grace/election timers:

```ts
const clearTimers = (): void => {
  clearConnectTimer();
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
```

- [ ] **Step 4: Add election logic inside the store closure**

Inside `create<PeerDataState>((set, get) => { ... })`, after the `setFallback` helper, add:

```ts
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
    if (winner === self.id) {
      set({ latestTable: promoted });
      state.startHost(promoted, self, callbacks);
    } else {
      state.joinHost(promoted.id, self, state.hostPassword, callbacks, promoted);
    }
  };

  const handleElectionMsg = (
    conn: DataConnection,
    data: unknown,
  ): void => {
    const el = get().election;
    if (!el || !el.active) return;
    const msg = parsePeerMsg(data);
    if (!msg) return;
    if (msg.type === "present") {
      if (msg.epoch < el.epoch) return;
      if (!el.participants.includes(msg.playerId)) {
        set((state) =>
          state.election
            ? {
                election: {
                  ...state.election,
                  participants: [
                    ...state.election.participants,
                    msg.playerId,
                  ],
                },
              }
            : {},
        );
        safeSend(conn, {
          type: "present",
          playerId: el.playerId,
          epoch: el.epoch,
          round: el.round,
        });
      }
      if (el.selfVote) {
        safeSend(conn, {
          type: "vote",
          voterId: el.playerId,
          candidateId: el.selfVote,
          epoch: el.epoch,
          round: el.round,
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
    const round = 1;
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

    peer.on("connection", (conn) => {
      conn.on("data", (data) => handleElectionMsg(conn, data));
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
```

- [ ] **Step 5: Set `selfPlayer`/`hostPassword` in `startHost`**

In `startHost`, inside the `set({ ... })` call, add:

```ts
        selfPlayer: player,
        hostPassword: "",
```

- [ ] **Step 6: Rewrite the client half of `joinHost`**

Replace the body of `joinHost` from `const prev = get();` through the end of the `peer.on("error", ...)` handler with:

```ts
      const prev = get();
      session += 1;
      const mySession = session;
      clearTimers();
      endElection();
      reportedFallback = null;
      destroyState(prev);
      connectAttempt = 0;
      if (prev.tableId !== tableId) wasConnected = false;
      const seeded =
        prev.tableId === tableId
          ? (prev.latestTable ?? baseTable ?? null)
          : (baseTable ?? null);

      const peer = new Peer(clientPeerId(player.id), peerOptions());
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
          wasConnected = true;
          clearGraceTimer();
          endElection();
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
          clearConnectTimer();
          set({ hostConn: null });
          startGraceTimer();
          if (!scheduleReconnect(connectToHost)) {
            setFallback(true, cb);
          }
        };

        conn.on("close", onDrop);
        conn.on("error", onDrop);
      };

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
        if (type === "unavailable-id" || type === "peer-unavailable") {
          clearConnectTimer();
          set({ hostConn: null });
          startGraceTimer();
          if (!scheduleReconnect(connectToHost)) {
            setFallback(true, cb);
          }
          return;
        }
        setFallback(true, cb);
      });
```

- [ ] **Step 7: Add `castVote` and reset election in `stop`**

Add the action after `sendUpdate`:

```ts
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
```

In `stop`, after `clearTimers();` add `endElection();` and `wasConnected = false;`, and extend the reset `set({ ... })` with:

```ts
        selfPlayer: null,
        hostPassword: "",
        election: null,
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/usePeerData.ts
git commit -m "feat(peer): mesh host election with epoch fencing"
```

---

### Task 3: Wire election into `useAppData`

**Files:**
- Modify: `src/hooks/useAppData.ts`

- [ ] **Step 1: Resume away players on join**

In `bridge.onJoin`, replace the early return:

```ts
  onJoin: (player, table) => {
    if (table.game.players.some((item) => item.id === player.id)) {
      const resumed = resumePlayer(table, player.id);
      if (resumed !== table) {
        void persistTableToAbly(resumed);
      }
      return resumed;
    }
```

Add `resumePlayer` to the `@logic/table` import.

- [ ] **Step 2: Expose election state and `castVote`**

Inside the `useAppData` hook, after the `useAblyStore()` destructure, add:

```ts
  const election = usePeerData((s) => s.election);
  const castVote = usePeerData((s) => s.castVote);
```

Add both to the returned object (next to `isPeerFallback`):

```ts
    election,
    castVote,
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat(peer): expose host election and resume away players"
```

---

### Task 4: Election overlay and strings

**Files:**
- Create: `src/components/GamePlayer/HostElection.tsx`
- Modify: `src/components/Tables/PlayingTable.tsx`
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add Vietnamese strings**

Add before the closing `};` in `src/locales/vi.ts`:

```ts
  "hostElection.title": "Chủ bàn mất kết nối",
  "hostElection.subtitle":
    "Bầu một người chơi mới làm chủ bàn để tiếp tục ván đấu.",
  "hostElection.choose": "Chọn chủ bàn mới",
  "hostElection.votesProgress": "Đã bầu {count}/{total}",
  "hostElection.waiting": "Đang chờ mọi người bầu...",
  "hostElection.retry": "Thử lại",
  "hostElection.failed": "Chưa đủ phiếu đồng thuận. Thử lại.",
```

- [ ] **Step 2: Add English strings**

Add before the closing `};` in `src/locales/en.ts`:

```ts
  "hostElection.title": "Host disconnected",
  "hostElection.subtitle":
    "Vote for a new host so the game can continue.",
  "hostElection.choose": "Choose a new host",
  "hostElection.votesProgress": "{count}/{total} voted",
  "hostElection.waiting": "Waiting for everyone to vote...",
  "hostElection.retry": "Retry",
  "hostElection.failed": "Not everyone agreed. Try again.",
```

- [ ] **Step 3: Create the overlay**

Create `src/components/GamePlayer/HostElection.tsx`:

```tsx
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";

const HostElection = () => {
  const { election, castVote, playingTable } = useAppData();
  const { t } = useI18n();
  if (!election?.active) return null;

  const nameOf = (id: string): string =>
    playingTable?.game.players.find((p) => p.id === id)?.name ?? id;
  const candidates = election.participants.filter(
    (pid) => pid !== election.hostId,
  );
  const total = election.participants.length;
  const voted = Object.keys(election.votes).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-md p-4 w-full max-w-md">
        <h2 className="font-bold text-lg">{t("hostElection.title")}</h2>
        <p className="text-sm mt-1">{t("hostElection.subtitle")}</p>
        <p className="text-sm mt-2 text-gray-600">
          {t("hostElection.votesProgress", { count: voted, total })}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {candidates.map((pid) => (
            <button
              key={pid}
              type="button"
              className={
                election.selfVote === pid
                  ? "w-full !py-2 border border-green-600 bg-green-600 text-white"
                  : "w-full !py-2 border border-gray-400 hover:bg-gray-100"
              }
              onClick={() => castVote(pid)}
            >
              {nameOf(pid)}
              {election.votes[pid] ? ` ✓` : ""}
            </button>
          ))}
        </div>
        {election.failed && (
          <p className="text-sm text-red-600 mt-3">
            {t("hostElection.failed")}
          </p>
        )}
        {!election.selfVote && !election.failed && (
          <p className="text-sm text-gray-500 mt-3">
            {t("hostElection.waiting")}
          </p>
        )}
      </div>
    </div>
  );
};

export default HostElection;
```

- [ ] **Step 4: Render it over the playing table**

In `src/components/Tables/PlayingTable.tsx`, add the import:

```ts
import HostElection from "../GamePlayer/HostElection";
```

And render it just inside the top-level returned fragment/element, after the existing content. If `PlayingTable` returns a single wrapper, add `<HostElection />` as the last child before the closing element; if it returns a fragment, add it as the last child.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/GamePlayer/HostElection.tsx src/components/Tables/PlayingTable.tsx src/locales/vi.ts src/locales/en.ts
git commit -m "feat(peer): host election overlay and i18n"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build and lint**

Run: `npm run build && npm run lint`
Expected: both PASS with no errors.

- [ ] **Step 2: Two-browser peer session**

Run: `npm run dev`, open the app in three browser profiles (or one normal + two private windows), choose "Play without Ably" (`credentials.playWithoutAbly`), and have one host create a table; share the peer link/QR with the other two, who join and ready up, then start a game so a turn is active.

- [ ] **Step 3: Kill the host and confirm election**

Close the host tab. Within ~10s (`HOST_GRACE_MS`), both remaining clients should show the `HostElection` overlay with each other and themselves as candidates. Confirm the progress counter increments as each votes and that voting for the same player promotes them (the overlay disappears and both clients reconnect to the new host).

- [ ] **Step 4: Confirm turn skipping and resume**

Ensure it was the old host's turn when it was killed: after promotion the game should be on the next player's turn. Reopen the original host with the same profile/link: it must join as a normal player, keep its cards/chips, and must NOT reclaim host (`hostId` remains the elected player).

- [ ] **Step 5: Confirm no-Ably path still works**

Repeat Steps 2-4 with no Ably key entered to confirm the feature works in pure peer mode.

- [ ] **Step 6: Final status**

Report build/lint output and the outcome of the manual checks. If any manual check fails, use the `systematic-debugging` skill before changing code.

---

## Self-Review Notes

- Spec coverage: deterministic ids (Task 1/2), `hostEpoch` (Task 1/2), away seat (Task 1), grace detection (Task 2), presence/vote/unanimity (Task 2), promotion + claim (Task 2), epoch guard (Task 2/3), resume on rejoin (Task 3), UI + i18n (Task 4), verification (Task 5).
- Type names consistent: `hostEpoch`, `isAway`, `clientPeerId`, `promoteHost`, `resumePlayer`, `isPlayerAway`, `HostElectionState`, `castVote`, `selfPlayer`, `hostPassword`.
- No `npm test` is invented; the repo has no test framework.

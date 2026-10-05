# Reload Rejoin + Lobby/Table UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume a table on reload (both transports), show a loading indicator while joining from a link/QR, auto-open the Share modal after creating a table, and move the Share action next to the table-info button.

**Architecture:** `Tables.tsx` captures the rejoin intent from the URL once at first render (`tblId`/`tblPw`) and uses it to resume the table before the URL-sync effect strips `tblId`. A shared `LoadingOverlay` blocks interaction during joins. `createTable` returns the created table so `NewTable` can hand it to a root-level `ShareTable`. `TableInfo` loses its Share button; `GamePlayer` gains a 📤 button.

**Tech Stack:** React 19, Zustand, TypeScript, Tailwind v4, Ably LiveObjects + PeerJS.

---

## File Structure

- `src/locales/vi.ts`, `src/locales/en.ts` — add `lobby.connecting`.
- `src/components/common/LoadingOverlay.tsx` — new full-screen spinner overlay.
- `src/hooks/useAppData.ts` — `createTable` returns `{ error, table }`.
- `src/components/Tables/NewTable.tsx` — `onCreated` callback.
- `src/components/Tables/TableInfo.tsx` — remove Share.
- `src/components/GamePlayer/GamePlayer.tsx` — add Share button.
- `src/components/Tables/Tables.tsx` — rejoin intent, loading overlay, auto-share.

Note: there is **no test framework**. Verification is `npm run build` (which runs `tsc -b`), `npm run lint`, and the manual checks in Task 9.

---

### Task 1: Add the `lobby.connecting` translation

**Files:**
- Modify: `src/locales/vi.ts` (near line 35, after `lobby.switchToPeer`)
- Modify: `src/locales/en.ts` (near line 38, after `lobby.switchToPeer`)

- [ ] **Step 1: Add the key to `vi.ts`**

After the `"lobby.switchToPeer"` line, add:

```ts
  "lobby.connecting": "Đang kết nối…",
```

- [ ] **Step 2: Add the key to `en.ts`**

After the `"lobby.switchToPeer"` line, add:

```ts
  "lobby.connecting": "Connecting…",
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS (the `satisfies Record<TranslationKey, string>` in `en.ts` requires both dictionaries to have the key).

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add connecting label"
```

---

### Task 2: Add the `LoadingOverlay` component

**Files:**
- Create: `src/components/common/LoadingOverlay.tsx`

- [ ] **Step 1: Create the component**

```tsx
import useI18n from "@hooks/useI18n";

const LoadingOverlay = () => {
  const { t } = useI18n();

  return (
    <div className="fixed z-20 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-y-3 backdrop-blur-sm bg-black/10">
      <div className="size-10 rounded-full border-4 border-gray-300 border-t-cyan-600 animate-spin" />
      <span className="text-gray-700">{t("lobby.connecting")}</span>
    </div>
  );
};

export default LoadingOverlay;
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/LoadingOverlay.tsx
git commit -m "feat: add loading overlay component"
```

---

### Task 3: Return the created table from `createTable`

**Files:**
- Modify: `src/hooks/useAppData.ts:602-623`

- [ ] **Step 1: Replace the `createTable` callback**

Replace the existing `createTable` block with:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAppData.ts
git commit -m "feat: return created table from createTable"
```

---

### Task 4: Add the `onCreated` callback to `NewTable`

**Files:**
- Modify: `src/components/Tables/NewTable.tsx:33` and `:60-81`

- [ ] **Step 1: Extend the props type**

Change:

```tsx
const NewTable = (props: { close: () => void; limit: number }) => {
```

to:

```tsx
const NewTable = (props: {
  close: () => void;
  limit: number;
  onCreated?: (table: Table) => void;
}) => {
```

- [ ] **Step 2: Invoke the callback on success**

In `submit`, replace the create/close block:

```ts
    const { error } = await createTable(payload);
    setIsSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    props.close();
```

with:

```ts
    const { error, table } = await createTable(payload);
    setIsSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (table) {
      props.onCreated?.(table);
    }
    props.close();
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Tables/NewTable.tsx
git commit -m "feat: notify when a table is created"
```

---

### Task 5: Remove Share from `TableInfo`

**Files:**
- Modify: `src/components/Tables/TableInfo.tsx`

- [ ] **Step 1: Drop the `ShareTable` import**

Remove:

```tsx
import ShareTable from "./ShareTable";
```

- [ ] **Step 2: Drop the `isSharing` state**

Remove:

```tsx
  const [isSharing, setIsSharing] = useState(false);
```

- [ ] **Step 3: Drop the header Share button**

In the header (`<div className="flex items-center justify-between gap-x-2">`), remove:

```tsx
          <button
            className="!py-1 !px-2 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={() => setIsSharing(true)}
          >
            {t("table.share")}
          </button>
```

- [ ] **Step 4: Drop the ShareTable render block**

Remove the closing block:

```tsx
      {isSharing && (
        <ShareTable table={playingTable!} onClose={() => setIsSharing(false)} />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Tables/TableInfo.tsx
git commit -m "refactor: move share out of table info"
```

---

### Task 6: Add the Share button to `GamePlayer`

**Files:**
- Modify: `src/components/GamePlayer/GamePlayer.tsx:14-15` (imports) and `:25` (state) and `:203-224` (action column)

- [ ] **Step 1: Import `ShareTable`**

After `import TableInfo from "../Tables/TableInfo";` add:

```tsx
import ShareTable from "../Tables/ShareTable";
```

- [ ] **Step 2: Add the state**

After `const [shouldShowHowToPlay, setShouldShowHowToPlay] = useState(false);` add:

```tsx
  const [shouldShowShareTable, setShouldShowShareTable] = useState(false);
```

- [ ] **Step 3: Add the 📤 button below the info button**

In the `isMe` action column, replace the block between the `TableInfo` render and the `🙋‍♂️` button:

```tsx
              {shouldShowTableInfo && (
                <TableInfo onClose={() => setShouldShowTableInfo(false)} />
              )}
              <button
                className="!p-0"
                onClick={() => setShouldShowHowToPlay(true)}
              >
```

with:

```tsx
              {shouldShowTableInfo && (
                <TableInfo onClose={() => setShouldShowTableInfo(false)} />
              )}
              <button
                className="!p-0"
                title={t("table.share")}
                onClick={() => setShouldShowShareTable(true)}
              >
                📤
              </button>
              {shouldShowShareTable && (
                <ShareTable
                  table={playingTable!}
                  onClose={() => setShouldShowShareTable(false)}
                />
              )}
              <button
                className="!p-0"
                onClick={() => setShouldShowHowToPlay(true)}
              >
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GamePlayer/GamePlayer.tsx
git commit -m "feat: add share button below table info"
```

---

### Task 7: `Tables` — rejoin intent, loading overlay, auto-share

**Files:**
- Modify: `src/components/Tables/Tables.tsx`

- [ ] **Step 1: Add imports**

Change the React import to include nothing new (already has `useEffect, useRef, useState`). Add after `import WelcomePlayer from "../Credentials/WelcomePlayer";`:

```tsx
import ShareTable from "./ShareTable";
import LoadingOverlay from "../common/LoadingOverlay";
```

- [ ] **Step 2: Destructure `peerError`**

In the `useAppData()` destructure, add `peerError`:

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
    peerError,
    getApiKey,
  } = useAppData();
```

- [ ] **Step 3: Add state, the rejoin intent, and the share state**

Replace:

```tsx
  const [enteringPeerTableId, setEnteringPeerTableId] = useState<string | null>(
    null,
  );
  const autoLinkedRef = useRef(false);
```

with:

```tsx
  const [enteringPeerTableId, setEnteringPeerTableId] = useState<string | null>(
    null,
  );
  const [isJoining, setIsJoining] = useState(false);
  const [sharingTable, setSharingTable] = useState<Table | null>(null);
  const [rejoinHandled, setRejoinHandled] = useState(false);

  // Capture the reload-rejoin intent at first render, before any effect can
  // strip `tblId` from the URL.
  const rejoinIntentRef = useRef<{
    tableId: string;
    password: string | null;
  } | null>(null);
  const rejoinInitRef = useRef(false);
  if (!rejoinInitRef.current) {
    rejoinInitRef.current = true;
    const url = new URL(window.location.href);
    const tableId = url.searchParams.get("tblId");
    if (tableId) {
      rejoinIntentRef.current = {
        tableId,
        password: url.searchParams.get("tblPw"),
      };
    }
  }
```

- [ ] **Step 4: Wrap join handlers with the loading state**

Replace `handlePasteLink` and `handleScan`:

```tsx
  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert(t("table.linkInvalid"));
        return;
      }
      setIsJoining(true);
      if (!(await applyLink(clipboardText))) {
        setIsJoining(false);
        alert(t("table.linkInvalid"));
      }
    } catch {
      setIsJoining(false);
      /* empty */
    }
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);
    setIsJoining(true);
    if (!(await applyLink(payload))) {
      setIsJoining(false);
      alert(t("table.linkInvalid"));
    }
  };
```

- [ ] **Step 5: Replace the two deep-link effects with a unified rejoin resolver**

Replace this whole block (from the `// Peer links: rejoin once...` comment through the end of the Ably deep-link effect):

```tsx
  // Peer links: rejoin once, even before any local tables exist.
  // InitAppData strips `mode` from the URL before this mounts, so read
  // tblId/tblPw directly instead of requiring `mode=peer`.
  useEffect(() => {
    if (mode !== "peer" || autoLinkedRef.current) return;
    autoLinkedRef.current = true;
    const url = new URL(window.location.href);
    const tableId = url.searchParams.get("tblId");
    if (!tableId) return;
    const localTable = getTables().find((item) => item.id === tableId);
    if (localTable) {
      setEnteringTable(localTable);
      return;
    }
    const password = url.searchParams.get("tblPw");
    if (password !== null) {
      joinPeerTable(tableId, password);
      return;
    }
    setEnteringPeerTableId(tableId);
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
  }, [tables, mode]);
```

with:

```tsx
  // Reload rejoin / deep link: resume the table referenced by the URL once the
  // transport is ready and (for Ably) the table list has loaded.
  useEffect(() => {
    const intent = rejoinIntentRef.current;
    if (!intent || rejoinHandled || !localPlayer) return;

    if (mode === "peer") {
      const localTable = getTables().find((item) => item.id === intent.tableId);
      if (localTable) {
        setRejoinHandled(true);
        setEnteringTable(localTable);
        return;
      }
      setRejoinHandled(true);
      if (intent.password !== null) {
        setIsJoining(true);
        joinPeerTable(intent.tableId, intent.password);
        return;
      }
      setEnteringPeerTableId(intent.tableId);
      return;
    }

    if (mode !== "ably") return;
    const table = tables.find((item) => item.id === intent.tableId);
    if (!table) return;
    setRejoinHandled(true);
    setEnteringTable(table);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tables, localPlayer, rejoinHandled]);

  // If the table never shows up (e.g. it was deleted), stop holding the URL.
  useEffect(() => {
    if (!rejoinIntentRef.current) return;
    const timer = window.setTimeout(() => setRejoinHandled(true), 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the join overlay as soon as there is something else to show.
  useEffect(() => {
    if (enteringTable || enteringPeerTableId || playingTable || peerError) {
      setIsJoining(false);
    }
  }, [enteringTable, enteringPeerTableId, playingTable, peerError]);
```

- [ ] **Step 6: Gate the URL-sync effect on the pending rejoin**

Change the start of the URL-sync effect:

```tsx
  useEffect(() => {
    let tableId = playingTable?.id || null;
```

to:

```tsx
  useEffect(() => {
    if (rejoinIntentRef.current && !rejoinHandled) return;
    let tableId = playingTable?.id || null;
```

and change its dependency array from `[playingTable]` to `[playingTable, rejoinHandled]`:

```tsx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable, rejoinHandled]);
```

- [ ] **Step 7: Pass `onCreated` and render the overlay + auto-share**

Change the `NewTable` render:

```tsx
            <NewTable
              close={() => setIsCreatingTable(false)}
              limit={TABLE_LIMIT}
            />
```

to:

```tsx
            <NewTable
              close={() => setIsCreatingTable(false)}
              limit={TABLE_LIMIT}
              onCreated={setSharingTable}
            />
```

Then change the end of the returned fragment:

```tsx
      {!!playingTable && <PlayingTable />}
    </>
  );
```

to:

```tsx
      {!!playingTable && <PlayingTable />}
      {!!sharingTable && (
        <ShareTable
          table={sharingTable}
          onClose={() => setSharingTable(null)}
        />
      )}
      {isJoining && <LoadingOverlay />}
    </>
  );
```

- [ ] **Step 8: Remove the now-unused `parseTableLink` import if flagged**

`parseTableLink` is still used by `applyLink`, so keep it. Verify no unused imports remain by running the build/lint in Step 9.

- [ ] **Step 9: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: PASS with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/Tables/Tables.tsx
git commit -m "feat: rejoin table on reload and show join/share feedback"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 2: Manual checks**

Run `npm run dev` and verify:

1. Ably: create a table, reload the page → you return to that table (not the lobby).
2. PeerJS: create a table, reload → you return to that table.
3. PeerJS client: join via link, reload → you return to the table.
4. Copy a table link; in the lobby, paste it → a blocking spinner appears until you enter / are prompted.
5. Scan a QR (or choose an image) → spinner appears.
6. Create a table → the Share modal opens immediately over the waiting table.
7. While in a game, the 📤 button sits below ℹ️ and opens Share; Table info has no Share button.
8. Invalid pasted/scanned link still alerts "Link is invalid" and leaves the lobby usable.

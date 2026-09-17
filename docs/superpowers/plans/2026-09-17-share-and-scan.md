# Share modal + QR Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TableInfo's "Copy link" button with a "Share" modal (QR code + note + Copy Link), and add a "Scan" option in Tables (camera viewfinder + image fallback) that decodes a join QR and opens the Enter Table flow.

**Architecture:** Two new presentational modals under `src/components/Tables/`: `ShareTable.tsx` renders the join URL as a QR with `qrcode.react` and owns the clipboard write; `ScanTable.tsx` owns the camera stream and QR decoding with `jsqr`, then delegates the join to the existing `EnterTable` flow owned by `Tables.tsx`. `Tables.tsx` gains the Scan button/state and the scanned-link handling, reusing its existing `enterTableWithLink` logic. All user-facing strings go through the i18n dictionaries.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`), Zustand 5, Vite 7, Tailwind v4, `qrcode.react` 4.2.0, `jsqr` 1.4.0.

**Testing note:** This repo has **no test framework** (see `AGENTS.md`). Verification per task is `npm run build` (which runs `tsc -b`) and `npm run lint`, plus the manual checks called out. Do not add a test runner.

**Conventions to follow:**
- Path aliases: `@hooks/*` and `@logic/*` only. Do **not** use `@/*` (fails `tsc`).
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- No code comments unless already present.
- `en.ts` must satisfy the same key set as `vi.ts` (`TranslationKey` is derived from `vi`).
- Code commits run the pre-commit hook (build + version bump); that is expected. The docs-only commits (Task 0, plan) use `--no-verify`.
- The pre-commit hook's `git add -u` only stages *tracked* files — explicitly `git add` new files before committing.

---

## File structure

Create:
- `src/components/Tables/ShareTable.tsx` — Share modal: table name, QR, note, Copy Link, Close.
- `src/components/Tables/ScanTable.tsx` — Scan modal: camera viewfinder, image picker fallback, `jsQR` decode loop.

Modify:
- `src/components/Tables/TableInfo.tsx` — swap the "Copy link" button for "Share"; open `ShareTable`; drop the now-unused `copied.url` branch.
- `src/components/Tables/Tables.tsx` — add the Scan button + modal state and the scanned-payload handler; refuse the join when the scanned table is not found.
- `src/locales/vi.ts`, `src/locales/en.ts` — new keys.
- `package.json`, `package-lock.json` — new dependencies.

---

## Task 0: Commit the plan (docs only)

**Files:**
- Create: `docs/superpowers/plans/2026-09-17-share-and-scan.md` (this file)

- [ ] **Step 1: Commit the plan without triggering the hook**

```bash
git add docs/superpowers/plans/2026-09-17-share-and-scan.md
git commit --no-verify -m "docs: add share modal + QR scan implementation plan"
```

---

## Task 1: Add the QR dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dependencies**

Run:

```bash
npm install qrcode.react@4.2.0 jsqr@1.4.0
```

Expected: `package.json` gains both under `dependencies`; install exits 0.

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: `tsc -b` and `vite build` both succeed (no source change yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode.react and jsqr"
```

Note: the pre-commit hook bumps the patch version and runs `npm install`; that is expected.

---

## Task 2: Add the i18n keys

**Files:**
- Modify: `src/locales/vi.ts`
- Modify: `src/locales/en.ts`

- [ ] **Step 1: Add the keys to `vi.ts`**

In `src/locales/vi.ts`, replace:

```ts
  "lobby.selectTable": "Chọn một bàn",
  "lobby.pasteLink": "Hoặc dán liên kết vào đây",
  "lobby.createTable": "Tạo bàn",
```

with:

```ts
  "lobby.selectTable": "Chọn một bàn",
  "lobby.pasteLink": "Hoặc dán liên kết vào đây",
  "lobby.scan": "Quét mã",
  "lobby.chooseImage": "Chọn ảnh",
  "lobby.scanError": "Không mở được camera. Hãy chọn ảnh chứa mã QR.",
  "lobby.createTable": "Tạo bàn",
```

Then replace:

```ts
  "table.copyLink": "Sao chép liên kết",
  "table.linkCopied": "Đã sao chép liên kết!",
```

with:

```ts
  "table.share": "Chia sẻ",
  "table.copyLink": "Sao chép liên kết",
  "table.linkCopied": "Đã sao chép liên kết!",
  "table.scanNote": "Nhờ bạn của bạn quét mã này để vào bàn.",
```

- [ ] **Step 2: Add the matching keys to `en.ts`**

In `src/locales/en.ts`, replace:

```ts
  "lobby.selectTable": "Select a table",
  "lobby.pasteLink": "Or paste your link here",
  "lobby.createTable": "Create table",
```

with:

```ts
  "lobby.selectTable": "Select a table",
  "lobby.pasteLink": "Or paste your link here",
  "lobby.scan": "Scan",
  "lobby.chooseImage": "Choose image",
  "lobby.scanError": "Could not open the camera. Choose an image with a QR code instead.",
  "lobby.createTable": "Create table",
```

Then replace:

```ts
  "table.copyLink": "Copy link",
  "table.linkCopied": "Link copied!",
```

with:

```ts
  "table.share": "Share",
  "table.copyLink": "Copy link",
  "table.linkCopied": "Link copied!",
  "table.scanNote": "Ask your friend to scan this to join the table.",
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS. `en.ts` still satisfies `Record<TranslationKey, string>` because `TranslationKey` now includes `table.share`, `table.scanNote`, `lobby.scan`, `lobby.chooseImage`, `lobby.scanError`, all of which `en.ts` now defines.

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add share/scan i18n keys"
```

---

## Task 3: Create the Share modal

**Files:**
- Create: `src/components/Tables/ShareTable.tsx`

Reuse the modal markup from `src/components/Tables/TableInfo.tsx:127-128` (backdrop + white panel) so the two modals look identical.

- [ ] **Step 1: Write the component**

Create `src/components/Tables/ShareTable.tsx`:

```tsx
import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";

const ShareTable = (props: { table: Table; onClose: () => void }) => {
  const { t } = useI18n();
  const { getApiKey } = useAppData();

  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}?apiKey=${getApiKey("encoded")}&tblId=${props.table.id}&tblPw=${props.table.password}`;

  const copyLink = useCallback(() => {
    if (!navigator.clipboard) {
      return;
    }
    navigator.clipboard
      .writeText(joinUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch((e) => {
        alert(e);
      });
  }, [joinUrl]);

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[22rem] max-w-[92%] gap-y-3 items-center">
        <div className="text-lg text-center w-full text-ellipsis overflow-hidden whitespace-nowrap">
          <span>{t("table.nameLabel")}</span>
          <span className="font-semibold">{props.table.name}</span>
        </div>
        <div className="bg-white p-2 border border-gray-200 rounded-sm">
          <QRCodeSVG value={joinUrl} size={200} />
        </div>
        <p className="text-sm text-center">{t("table.scanNote")}</p>
        <div className="w-full flex justify-center gap-x-4">
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={copyLink}
          >
            {copied ? t("table.linkCopied") : t("table.copyLink")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={props.onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareTable;
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS. `ShareTable` is unused so far; `noUnusedLocals` only flags unused *locals*, not exported modules.

- [ ] **Step 3: Commit**

```bash
git add src/components/Tables/ShareTable.tsx
git commit -m "feat: add ShareTable modal"
```

---

## Task 4: Wire the Share modal into TableInfo

**Files:**
- Modify: `src/components/Tables/TableInfo.tsx`

- [ ] **Step 1: Import the new component and add modal state**

In `src/components/Tables/TableInfo.tsx`, replace:

```ts
import useLocalPlayer from "@hooks/useLocalPlayer";
import { ActionDef, isGameInProgress } from "@logic/game";
import LanguageSwitcher from "../common/LanguageSwitcher";
```

with:

```ts
import useLocalPlayer from "@hooks/useLocalPlayer";
import { ActionDef, isGameInProgress } from "@logic/game";
import LanguageSwitcher from "../common/LanguageSwitcher";
import ShareTable from "./ShareTable";
```

- [ ] **Step 2: Remove the `url` copy state and branch**

Replace:

```ts
  const [copied, setCopied] = useState({
    url: false,
    key: false,
    result: false,
  });
```

with:

```ts
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState({
    key: false,
    result: false,
  });
```

Then replace the `copy` callback's type and body:

```ts
  const copy = useCallback(
    (type: "url" | "key" | "result") => {
      const encodedApiKey = getApiKey("encoded");
      let content = encodedApiKey;
      if (!navigator.clipboard) {
        return;
      }
      if (type === "url") {
        content = `${window.location.origin}?apiKey=${encodedApiKey}&tblId=${playingTable!.id}&tblPw=${playingTable!.password}`;
      }

      if (type === "result") {
```

with:

```ts
  const copy = useCallback(
    (type: "key" | "result") => {
      const encodedApiKey = getApiKey("encoded");
      let content = encodedApiKey;
      if (!navigator.clipboard) {
        return;
      }
      if (type === "result") {
```

- [ ] **Step 3: Replace the Copy link button with a Share button**

Replace:

```tsx
          <button
            className="!py-1 !px-2 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={() => copy("url")}
          >
            {copied.url ? t("table.linkCopied") : t("table.copyLink")}
          </button>
```

with:

```tsx
          <button
            className="!py-1 !px-2 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={() => setIsSharing(true)}
          >
            {t("table.share")}
          </button>
```

- [ ] **Step 4: Render the Share modal**

Replace the closing of the component's returned JSX:

```tsx
        </div>
      </div>
    </div>
  );
};
```

with:

```tsx
        </div>
      </div>
      {isSharing && (
        <ShareTable table={playingTable!} onClose={() => setIsSharing(false)} />
      )}
    </div>
  );
};
```

Be careful: this closing block also appears in `TablePlayerInfo`. Make the edit inside the `TableInfo` component's return (the block directly after the Close/Update buttons), not in `TablePlayerInfo`. If the string is ambiguous, include the preceding `</div>` from the button row in `oldString`.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: both PASS. There is no remaining reference to `copied.url`.

- [ ] **Step 6: Manual check**

Run `npm run dev`, open a table, open the info modal from the game screen, tap **Share**: the modal shows the table name, a QR, the note, **Copy link** (toggles to "Copied!"), and **Close**. Scan the QR with a phone camera app and confirm the URL matches `?apiKey=...&tblId=...&tblPw=...`.

- [ ] **Step 7: Commit**

```bash
git add src/components/Tables/TableInfo.tsx
git commit -m "feat: open Share modal from TableInfo"
```

---

## Task 5: Create the Scan modal

**Files:**
- Create: `src/components/Tables/ScanTable.tsx`

The component owns: the camera stream, the decode loop, the image fallback, and the inline error. It reports a decoded string up via `onScan` and never decides what to do with it.

- [ ] **Step 1: Write the component**

Create `src/components/Tables/ScanTable.tsx`:

```tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import jsQR from "jsqr";
import useI18n from "@hooks/useI18n";

const ScanTable = (props: {
  onScan: (payload: string) => void;
  onClose: () => void;
}) => {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const decodeFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(decodeFrame);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(decodeFrame);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result?.data) {
        stopCamera();
        props.onScan(result.data);
        return;
      }
      rafRef.current = requestAnimationFrame(decodeFrame);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(decodeFrame);
      } catch {
        if (!cancelled) {
          setError(t("lobby.scanError"));
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickImage = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
          );
          if (result?.data) {
            stopCamera();
            props.onScan(result.data);
          } else {
            setError(t("table.linkInvalid"));
          }
        }
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        setError(t("table.linkInvalid"));
        URL.revokeObjectURL(url);
      };
      image.src = url;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopCamera],
  );

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[22rem] max-w-[92%] gap-y-3 items-center">
        <div className="relative w-full aspect-square bg-black rounded-sm overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
        </div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <div className="w-full flex justify-center gap-x-4">
          <label className="!py-1 !px-0 w-[8rem] text-xs text-center border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300 cursor-pointer">
            {t("lobby.chooseImage")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickImage}
            />
          </label>
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={props.onClose}
          >
            {t("common.close")}
          </button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default ScanTable;
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/Tables/ScanTable.tsx
git commit -m "feat: add ScanTable modal with camera and image decoding"
```

---

## Task 6: Wire the Scan flow into Tables

**Files:**
- Modify: `src/components/Tables/Tables.tsx`

`Tables.tsx` already has `enterTableWithLink` (opens `EnterTable` for a link whose origin matches) and the `enteringTable` state (`Tables.tsx:46-57`). Extract the `tblId` parsing so the scanned handler can reuse it and re-init Ably when the scanned key differs.

- [ ] **Step 1: Add the `ScanTable` import**

Replace:

```ts
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";
```

with:

```ts
import EnterTable from "./EnterTable";
import ScanTable from "./ScanTable";
import PlayingTable from "./PlayingTable";
```

- [ ] **Step 2: Add scan state**

Replace:

```ts
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);
```

with:

```ts
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);
```

- [ ] **Step 3: Refactor link parsing and add the scanned-payload handler**

Replace the whole `handlePasteLink` + `enterTableWithLink` block:

```ts
  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert(t("table.linkInvalid"));
        return;
      }
      enterTableWithLink(clipboardText, tables);
    } catch {
      /* empty */
    }
  };

  const enterTableWithLink = (link: string, tables: Table[]) => {
    if (!tables?.length || !link) return;

    const queryObj = new URL(link).searchParams;
    const tableId = queryObj.get("tblId");
    if (!tableId) return;

    const table = tables.find((item) => item.id === tableId);
    if (!table) return;

    setEnteringTable(table);
  };
```

with:

```ts
  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert(t("table.linkInvalid"));
        return;
      }
      enterTableWithLink(clipboardText, tables);
    } catch {
      /* empty */
    }
  };

  const enterTableWithLink = (link: string, tables: Table[]) => {
    if (!tables?.length || !link) return;

    const queryObj = new URL(link).searchParams;
    const tableId = queryObj.get("tblId");
    if (!tableId) {
      alert(t("table.linkInvalid"));
      return;
    }

    const table = tables.find((item) => item.id === tableId);
    if (!table) {
      alert(t("table.linkInvalid"));
      return;
    }

    setEnteringTable(table);
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);

    let scannedUrl: URL;
    try {
      scannedUrl = new URL(payload);
    } catch {
      alert(t("table.linkInvalid"));
      return;
    }

    const tableId = scannedUrl.searchParams.get("tblId");
    if (!tableId) {
      alert(t("table.linkInvalid"));
      return;
    }

    const scannedKey = scannedUrl.searchParams.get("apiKey") || "";
    const isSameKey = scannedKey === getApiKey("encoded");

    if (!isSameKey) {
      const { error } = await init(scannedKey);
      if (error) {
        alert(error.message);
        return;
      }
    }

    const table = getTables().find((item) => item.id === tableId);
    if (!table) {
      alert(t("table.linkInvalid"));
      return;
    }

    setEnteringTable(table);
  };
```

Note: `tables` from the hook is stale immediately after `init` re-subscribes, so `handleScan` reads the fresh value through a `getTables()` helper that Step 4 adds to `useAppData`.

- [ ] **Step 4: Expose a fresh-tables getter from `useAppData`**

In `src/hooks/useAppData.ts`, at the end of the file, after the `useAppData` definition:

```ts
const useAppData = () => {
```

the store singleton is named `useAblyStore`. Add an exported getter. Replace:

```ts
const storeApiKey = (apiKey: string) => {
```

with:

```ts
export const getTables = (): Table[] => useAblyStore.getState().tables;

const storeApiKey = (apiKey: string) => {
```

Then in `src/components/Tables/Tables.tsx`, replace the import:

```ts
import useAppData from "@hooks/useAppData";
```

with:

```ts
import useAppData, { getTables } from "@hooks/useAppData";
```

- [ ] **Step 5: Destructure `getApiKey` and `init` from the hook**

Replace:

```ts
  const { tables, playingTable, removeTable } = useAppData();
```

with:

```ts
  const { tables, playingTable, removeTable, init, getApiKey } = useAppData();
```

- [ ] **Step 6: Add the Scan button below Paste link**

Replace:

```tsx
            <p className="mt-4">{t("lobby.pasteLink")}</p>
            <button
              type="button"
              className="!p-2 mt-1 w-full max-w-[25rem] text-ellipsis overflow-hidden whitespace-nowrap border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 text-gray-500 hover:text-gray-800 text-sm text-left"
              onClick={handlePasteLink}
            >{`${window.location.origin}?apiKey=xxx&tblId=xxx`}</button>
```

with:

```tsx
            <p className="mt-4">{t("lobby.pasteLink")}</p>
            <button
              type="button"
              className="!p-2 mt-1 w-full max-w-[25rem] text-ellipsis overflow-hidden whitespace-nowrap border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 text-gray-500 hover:text-gray-800 text-sm text-left"
              onClick={handlePasteLink}
            >{`${window.location.origin}?apiKey=xxx&tblId=xxx`}</button>
            <p className="mt-4">{t("lobby.scan")}</p>
            <button
              type="button"
              className="!p-2 mt-1 w-full max-w-[25rem] border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 text-sm"
              onClick={() => setIsScanning(true)}
            >
              {t("lobby.scan")}
            </button>
```

- [ ] **Step 7: Render the Scan modal**

Replace:

```tsx
          {!!enteringTable && (
            <EnterTable
              table={enteringTable}
              close={() => setEnteringTable(null)}
            />
          )}
```

with:

```tsx
          {isScanning && (
            <ScanTable
              onScan={handleScan}
              onClose={() => setIsScanning(false)}
            />
          )}
          {!!enteringTable && (
            <EnterTable
              table={enteringTable}
              close={() => setEnteringTable(null)}
            />
          )}
```

- [ ] **Step 8: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: both PASS. In particular, `init`, `getApiKey`, and `getTables` are all used and `getTables` is exported.


- [ ] **Step 9: Manual check**

Run `npm run dev` on the LAN host. On one device open a table and its Share modal; on a second device (or browser profile) open the app, go to Tables → **Scan**, allow the camera, and scan the first screen's QR. Expected: the Scan modal closes and the Enter Table password modal opens for that table; entering the password joins. Retry by using **Choose image** with a screenshot of the QR. Then scan an unrelated QR (e.g. a random URL) and confirm the "Liên kết không hợp lệ" alert and that the Scan modal is closed. Close the Scan modal while the viewfinder is live and confirm the camera indicator turns off.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useAppData.ts src/components/Tables/Tables.tsx
git commit -m "feat: add QR Scan flow to Tables"
```

---

## Task 7: Final verification

**Files:** none

- [ ] **Step 1: Full build and lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 2: Confirm the spec checklist**

Verify each item from `docs/superpowers/specs/2026-09-17-share-and-scan-design.md`:
- TableInfo button reads "Share" in both locales and opens the Share modal. (Task 4)
- Share modal has table name, QR, note, Copy Link, Close. (Task 3)
- Tables has a Scan option below Paste link. (Task 6)
- Scan modal uses the camera and offers an image fallback. (Task 5)
- Decoded payload re-inits Ably when the key differs and opens Enter Table. (Task 6)
- Invalid/unmatched QR shows `table.linkInvalid`. (Tasks 5, 6)
- Camera is stopped on decode and on close/unmount. (Task 5)
- Both locales define every new key. (Task 2)

- [ ] **Step 3: Commit any remaining changes**

```bash
git status
```

Expected: clean working tree (all tasks already committed).

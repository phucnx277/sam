# Download QR from Share Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download QR" button to the Share modal that saves the table's join QR code as a PNG file.

**Architecture:** Keep the existing `QRCodeSVG` for on-screen rendering. Attach a ref to it, and on click serialize the SVG, draw it onto a 1024×1024 white canvas, and export the canvas as a PNG via a temporary `<a download>` element. No new dependencies.

**Tech Stack:** React 19, TypeScript, `qrcode.react` 4.2.0, Tailwind v4.

**Note on testing:** This repo has no test framework (see AGENTS.md) and no `npm test`. Verification is `npm run build` (which runs `tsc -b`) and `npm run lint`, plus the manual check in Task 3. Do not invent test files.

**Note on commits:** The pre-commit hook runs `npm run build` and bumps the patch version, then `git add -u`. So each commit is slow and changes `package.json`/`package-lock.json`. Stage new files explicitly before committing.

**Spec:** `docs/superpowers/specs/2026-10-01-share-qr-download-design.md`

---

### Task 1: Add the `table.downloadQr` i18n key

**Files:**
- Modify: `src/locales/vi.ts:54` (after `table.linkCopied`)
- Modify: `src/locales/en.ts:58` (after `table.linkCopied`)

- [ ] **Step 1: Add the key to `src/locales/vi.ts`**

Immediately after the line `"table.linkCopied": "Đã sao chép liên kết!",` add:

```ts
  "table.downloadQr": "Tải mã QR",
```

- [ ] **Step 2: Add the key to `src/locales/en.ts`**

Immediately after the line `"table.linkCopied": "Link copied!",` add:

```ts
  "table.downloadQr": "Download QR",
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build succeeds; `en.ts` satisfies the same key set as `vi.ts` (both files are typed against the dictionary, so a missing key fails `tsc`).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts
git commit -m "feat: add download QR i18n key"
```

---

### Task 2: Add the Download QR button and PNG export

**Files:**
- Modify: `src/components/Tables/ShareTable.tsx`

The file currently starts with:

```tsx
import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
```

and defines `svgRef` nowhere. The rendered QR and buttons currently look like:

```tsx
        <div className="bg-white p-2 border border-gray-200 rounded-sm">
          <QRCodeSVG value={joinUrl} size={200} />
        </div>
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
```

- [ ] **Step 1: Import `useRef`**

Change the first import line to:

```tsx
import { useCallback, useRef, useState } from "react";
```

- [ ] **Step 2: Add the `svgRef` and the `downloadQr` handler**

Add `svgRef` next to the existing state declaration:

```tsx
  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
```

Then add the handler after the existing `copyLink` callback (before the `return (`):

```tsx
  const downloadQr = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        const size = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const anchor = document.createElement("a");
        anchor.href = canvas.toDataURL("image/png");
        anchor.download = `sam-${props.table.id}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        svgString
      )}`;
    } catch (e) {
      alert(e);
    }
  }, [props.table.id]);
```

- [ ] **Step 3: Attach the ref to the QR SVG**

Replace `<QRCodeSVG value={joinUrl} size={200} />` with:

```tsx
          <QRCodeSVG ref={svgRef} value={joinUrl} size={200} />
```

(`QRCodeSVG` is a `forwardRef` to the `<svg>` element — ref type is `SVGSVGElement`.)

- [ ] **Step 4: Rewrite the button row**

Replace the whole `<div className="w-full flex justify-center gap-x-4">…</div>` block with:

```tsx
        <div className="w-full flex justify-center gap-x-4">
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={copyLink}
          >
            {copied ? t("table.linkCopied") : t("table.copyLink")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={downloadQr}
          >
            {t("table.downloadQr")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={props.onClose}
          >
            {t("common.close")}
          </button>
        </div>
```

All three buttons keep `text-xs`; the fixed `w-[8rem]` is replaced by `flex-1 min-w-0` so they fit the `w-[22rem]` modal.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Tables/ShareTable.tsx
git commit -m "feat: download share QR as PNG"
```

---

### Task 3: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open the app (or use the LAN URL on another device).

- [ ] **Step 2: Verify the download**

Create/open a table → tap **Share**. The row shows **Copy link**, **Download QR**, **Close**. Tap **Download QR**.
Expected: a file named `sam-<tableId>.png` downloads; opening it shows the QR code on a white background, with no clipping or transparent edges.

- [ ] **Step 3: Verify the QR works**

Open the downloaded PNG on a second device and use the app's **Scan** flow (or any QR scanner) to read it. Expected: it resolves to the same join URL as the on-screen QR (`<origin>?mode=peer|apiKey=…&tblId=…&tblPw=…`).

- [ ] **Step 4: Verify layout**

Confirm all three buttons fit on one row without overflowing, and that the modal still scrolls if its content exceeds the viewport.

No commit — this is verification only.

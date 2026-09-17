# Share modal + QR Scan — Design

## Goal

Add a "Share" flow for a table (QR code + copy link) and a "Scan" flow in the
Tables screen (camera + image fallback) so players can join without pasting a
link by hand.

## Background

Joining a table today:

- `TableInfo.tsx` has a **Copy link** button that writes
  `${origin}?apiKey=${encodedApiKey}&tblId=${id}&tblPw=${password}` to the
  clipboard (`copy("url")`).
- `Tables.tsx` has a **Paste link** button (`handlePasteLink`) that reads the
  clipboard, validates it starts with the origin, extracts `tblId`, and opens
  the `EnterTable` modal for the matching table.
- `InitAppData.tsx` handles `apiKey`, `tblId`, `tblPw` query params on first
  load and strips them from the URL.
- No QR/camera library is installed.

## Scope

In scope: a Share modal reachable from TableInfo, a Scan modal in Tables
(camera + image), i18n keys for both, and two new dependencies.

Out of scope: changing how tables are stored in Ably, changing the EnterTable
password flow, changing link/blog behavior on first load.

## Dependencies

- `qrcode.react` — renders a QR as an SVG React component.
- `jsqr` — decodes a QR from raw pixel data (used for both camera frames and
  picked images).

## Share modal

New component `src/components/Tables/ShareTable.tsx`.

- Opened from `TableInfo.tsx`. The header button label changes from
  `table.copyLink` to `table.share`; the `copied.url` state moves into the new
  component.
- Contents, top to bottom:
  1. Table name (`table.nameLabel` + `playingTable.name`).
  2. QR code of the join URL:
     `${window.location.origin}?apiKey=${encodedApiKey}&tblId=${playingTable.id}&tblPw=${playingTable.password}`.
  3. Note: `table.scanNote` — "Ask your friend to scan this to join the
     table." / "Nhờ bạn của bạn quét mã này để vào bàn."
  4. **Copy Link** button: same clipboard behavior as today, toggling to
     `table.linkCopied` for 2 seconds.
  5. **Close** button (`common.close`), calls `onClose`.
- Reuses the existing modal backdrop / white panel classes used by `TableInfo`
  and `EnterTable`.

## Scan modal

New component `src/components/Tables/ScanTable.tsx`.

- Opened from a new **Scan** button (`lobby.scan`) in `Tables.tsx`, placed
  directly below the existing Paste link button.
- On open:
  - Request `getUserMedia({ video: { facingMode: "environment" } })`.
  - Show a live `<video>` viewfinder.
  - Periodically draw the current frame to a hidden `<canvas>` and run `jsQR`
    on the pixel data until a code is decoded.
- A **Choose image** button (`lobby.chooseImage`) opens a file picker; the
  chosen image is drawn to the same canvas and decoded with `jsQR`. This works
  even when the camera is unavailable.
- Camera errors (denied permission, no camera) show an inline message
  (`lobby.scanError`); the image option remains available.
- On a successful decode:
  - Stop the camera (stop all tracks) and close the modal.
  - Parse the payload as a URL. Reject with `table.linkInvalid` when it is not
    a URL or has no `tblId`.
  - Compare the scanned `apiKey` with the stored key (both encoded):
    - **Same key:** find the table by `tblId` in `tables` and open `EnterTable`
      for it (same behavior as Paste link).
    - **Different key:** re-init the Ably client using the scanned key via
      `init` from `useAppData`, then open `EnterTable` for the table with
      `tblId`. `tblPw` from the QR is passed to `EnterTable` the same way a
      link's `tblPw` is handled today.
  - Reject with `table.linkInvalid` when no table with `tblId` exists.
- On close/unmount: stop all camera tracks and any active decode loop.

## i18n

Add to `src/locales/vi.ts` (source of truth) and mirror in `src/locales/en.ts`:

| Key | vi | en |
| --- | --- | --- |
| `table.share` | Chia sẻ | Share |
| `table.scanNote` | Nhờ bạn của bạn quét mã này để vào bàn. | Ask your friend to scan this to join the table. |
| `lobby.scan` | Quét mã | Scan |
| `lobby.chooseImage` | Chọn ảnh | Choose image |
| `lobby.scanError` | Không mở được camera. Hãy chọn ảnh chứa mã QR. | Could not open the camera. Choose an image with a QR code instead. |

`en.ts` must satisfy the same key set as `vi.ts`.

## Files

- New: `src/components/Tables/ShareTable.tsx`,
  `src/components/Tables/ScanTable.tsx`.
- Edit: `src/components/Tables/TableInfo.tsx`,
  `src/components/Tables/Tables.tsx`, `src/locales/vi.ts`,
  `src/locales/en.ts`, `package.json`, `package-lock.json`.

## Verification

- `npm run build` (typecheck) and `npm run lint` pass.
- Manual: open TableInfo → Share → QR renders and Copy Link copies; Tables →
  Scan → camera decodes a QR shown on another screen and opens EnterTable;
  Choose image decodes a saved QR screenshot; bad QR shows the invalid-link
  message; closing the modal stops the camera.

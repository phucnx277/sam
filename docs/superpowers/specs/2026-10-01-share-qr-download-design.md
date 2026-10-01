# Download QR from Share modal — Design

## Goal

Let a table host download the join QR code as a PNG file from the Share modal,
so it can be printed or sent through channels that do not accept a copied link.

## Background

`ShareTable.tsx` renders the join URL as a `QRCodeSVG` (`qrcode.react` 4.2.0)
and offers **Copy link** and **Close** buttons. There is no way to export the
QR itself. The QR is an inline SVG with a transparent background; the white
square around it is the wrapping `div`'s background.

## Scope

In scope: a **Download QR** button in `ShareTable.tsx`, the SVG→canvas→PNG
conversion, and one i18n key.

Out of scope: filename customization, composing the table name or join URL
into the image, an SVG download option, and any new dependency.

## UI

Add a third button to the existing button row, between **Copy link** and
**Close**, labelled with the new `table.downloadQr` key.

Three `w-[8rem]` buttons do not fit the `w-[22rem]` modal, so the row's buttons
change from fixed width to `flex-1 min-w-0` and keep `text-xs`. The row keeps
its `flex justify-center gap-x-4`.

## Download logic

In `ShareTable.tsx`:

- Attach a `useRef<SVGSVGElement>(null)` (`svgRef`) to the `QRCodeSVG`.
- Handler (`downloadQr`):
  1. `const svg = svgRef.current; if (!svg) return;`
  2. Serialize: `new XMLSerializer().serializeToString(svg)`.
  3. Build a data URL:
     `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`.
  4. Create `new Image()`; on `load`:
     - create a canvas sized 1024×1024;
     - fill it white (`fillStyle = "#fff"`, `fillRect`), since the QR is
       transparent;
     - `drawImage(img, 0, 0, 1024, 1024)`;
     - `const png = canvas.toDataURL("image/png")`;
     - create an `<a>` with `href = png` and
       `download = \`sam-${props.table.id}.png\``, `click()` it, remove it.
  5. Assign `img.src` last, after `onload` is set.
- Wrap the handler body in `try/catch`; on failure call `alert(e)`, matching the
  existing `copyLink` error behavior.

A 1024px canvas gives a crisp PNG independent of the 200px on-screen render.

## i18n

Add to `src/locales/vi.ts` (source of truth) and mirror in
`src/locales/en.ts`:

| Key | vi | en |
| --- | --- | --- |
| `table.downloadQr` | Tải mã QR | Download QR |

`en.ts` must satisfy the same key set as `vi.ts`.

## Files

- Edit: `src/components/Tables/ShareTable.tsx`, `src/locales/vi.ts`,
  `src/locales/en.ts`.

## Verification

- `npm run build` (typecheck) and `npm run lint` pass.
- Manual: open a table → Share → **Download QR**; a file named
  `sam-<tableId>.png` is saved, contains the QR on a white background, and
  scanning it with the app's Scan flow joins the table.

# Configurable currency symbol for chip counts

Date: 2026-10-16
Status: approved (autonomous flow)

## Problem

The chip counter in `PlayerInfo` prefixes the count with an emoji (`⛁`, then
`🪙`). Emoji glyphs render inconsistently across platforms (Apple Color Emoji
has non-linear glyph metrics at small sizes and draws a larger visible mark than
Noto/Segoe), so the icon looks different and out of place on iOS vs
web/Android. The user wants a plain currency symbol instead, defaulting to `💰`,
and wants it configurable in Settings.

## Decision

- Introduce a local, device-scoped setting `currency`: a short string, default
  `"💰"`, persisted in `localStorage` under `sam.currency`.
- Expose it through a new Zustand store `useCurrency`, mirroring `useI18n`.
- Add a "Currency symbol" row to the Settings modal with a free-text input
  (max 3 characters).
- `PlayerInfo`'s `ChipCount` renders the symbol instead of the emoji.

Scope: the in-game per-player chip count only. The host table roster, copied
results, and how-to-play text are unchanged.

## Approaches considered

- **A (chosen).** Dedicated `useCurrency` Zustand store persisted to
  `sam.currency`, following the existing `useI18n` / `useLocalPlayer` pattern.
  Clear ownership, trivial to consume, no identity coupling.
- B. Store the symbol on `useLocalPlayer`. Rejected: mixes a display preference
  with player identity persisted in `sam.player`.
- C. Store the symbol on the `Table` so it is shared table-wide. Rejected: it is
  a per-device display preference, and the request places it in Settings.

## Design

### `useCurrency` hook (new: `src/hooks/useCurrency.ts`)

```ts
const LS_CURRENCY_KEY = "sam.currency";
const DEFAULT_CURRENCY = "💰";
const MAX_CURRENCY_LENGTH = 3;

const normalize = (value: string): string =>
  Array.from(value.trim()).slice(0, MAX_CURRENCY_LENGTH).join("");
```

- The value is trimmed and clamped to 3 code points (so surrogate pairs/emoji are
  never split). An empty value is allowed and means no symbol is shown.
- `getInitialCurrency()`: read `sam.currency` from `localStorage`; if the key is
  missing (`null`), return `DEFAULT_CURRENCY`; an empty stored value stays empty.
- Store shape (module-level singleton via `create()`):

  ```ts
  {
    currency: string;
    setCurrency: (value: string) => void;
  }
  ```

  `setCurrency` normalizes the input, writes `sam.currency`, and updates the
  store.
- Default export the store, like `useI18n`.

### `Settings.tsx`

Add a row above the close button, mirroring the language row:

```tsx
<div className="flex items-center justify-between gap-x-2">
  <span>{t("settings.currency")}</span>
  <input
    type="text"
    maxLength={3}
    value={currency}
    onChange={(e) => setCurrency(e.target.value)}
    className="w-16 py-1 px-2 border border-gray-500 rounded-sm text-center"
  />
</div>
```

The input is bound directly to the store, so clearing it is allowed and shows no
symbol (the chip count then displays only the number). Because the value lives in
the store, chip counts update live as you type. `maxLength=3` keeps the symbol
short.

### `PlayerInfo.tsx`

`ChipCount` reads `currency` from `useCurrency` and replaces the emoji span:

```tsx
<span className="text-lg leading-5">{currency}</span>
<span>{chip}</span>
```

The symbol inherits the parent's green/red `text-*` color (`currentColor`), so
positive/negative chips stay color-coded.

### i18n (`src/locales/vi.ts`, `src/locales/en.ts`)

- Add `settings.currency`: vi "Ký hiệu tiền tệ" / en "Currency symbol".

## Out of scope

- No change to how chip numbers are stored or transferred.
- No table-wide/shared currency symbol.
- No new test framework (the project has none); verification is
  `npm run build` + `npm run lint` + manual review.

## Verification

- `npm run build` passes (type-checks en/vi key parity via `satisfies`).
- `npm run lint` passes.
- Manual: default `💰` shows next to chip counts; editing the field updates every
  chip count live and persists across reload; clearing the field shows no symbol.

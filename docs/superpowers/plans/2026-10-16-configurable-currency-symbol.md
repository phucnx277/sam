# Plan: Configurable currency symbol for chip counts

Spec: `docs/superpowers/specs/2026-10-16-configurable-currency-symbol-design.md`

## Task 1: Add the `useCurrency` store

File: `src/hooks/useCurrency.ts` (new)

Implement the Zustand store per the spec: `sam.currency` localStorage key,
`💰` default, normalize to a trimmed max-3-code-point string (empty allowed,
means no symbol), and a `setCurrency` that normalizes, persists, and updates
state. Default export.

## Task 2: Add the Settings row

File: `src/components/GamePlayer/Settings.tsx`

Read `currency`/`setCurrency` from `useCurrency` and add the
"Currency symbol" row (label + max-3 text input) above the close button.

## Task 3: Render the symbol in the chip count

File: `src/components/GamePlayer/PlayerInfo.tsx`

In `ChipCount`, read `currency` from `useCurrency` and replace the `🪙` span
with `<span className="text-lg leading-5">{currency}</span>`.

## Task 4: Update locales

Files: `src/locales/vi.ts`, `src/locales/en.ts`

Add `settings.currency`: vi "Ký hiệu tiền tệ" / en "Currency symbol".

## Task 5: Verify and commit

1. `npm run build` (type-checks en/vi parity via `satisfies`).
2. `npm run lint`.
3. Confirm `🪙` and `⛁` have no source references.
4. Commit spec + plan + code. Pre-commit hook runs the build and bumps the
   patch version, as usual.

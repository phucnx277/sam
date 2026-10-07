# Plan: Connection benefit notes

Spec: `docs/superpowers/specs/2026-10-07-connection-benefit-notes-design.md`

## Task 1: Add the two i18n keys

- `src/locales/vi.ts` — add `connection.fastBenefit`, `connection.compatibleBenefit`
  (source of truth for `TranslationKey`).
- `src/locales/en.ts` — add the matching English values.

Place them in a `connection.*` group near the existing `lobby.*` keys.

## Task 2: Render the notes

- `src/components/Credentials/InitAppData.tsx`: muted `<p>` under the submit
  button (`compatibleBenefit`) and under the fast-connection button
  (`fastBenefit`).
- `src/components/Tables/Tables.tsx`: muted `<p>` inside the `mode === "peer"`
  block (`compatibleBenefit`) and the `mode === "ably"` block (`fastBenefit`).

## Task 3: Verify

1. `npm run build`.
2. `npm run lint`.

## Task 4: Commit

Commit locale + component changes. Pre-commit hook builds and bumps version.

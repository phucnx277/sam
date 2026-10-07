# Plan: User-friendly copy de-jargoning

Spec: `docs/superpowers/specs/2026-10-07-user-friendly-copy-design.md`

## Task 1: Rewrite the 8 string values in both locales

Files:
- `src/locales/en.ts`
- `src/locales/vi.ts`

Apply the exact English/Vietnamese values from the spec's string-change list.
Keys are untouched; only values change.

## Task 2: Verify

1. `npm run build` (also the type-check via `tsc -b`).
2. `npm run lint`.
3. Confirm no user-facing jargon remains:
   `rg -n -i "ably|peerjs|indirect|api.?key" src/locales` should return
   only the intended `https://ably.com` reference is in a component (not
   locales), and no leftover locale hits.

## Task 3: Commit

Commit the two locale files. Pre-commit hook runs the build and bumps the
patch version, as usual.

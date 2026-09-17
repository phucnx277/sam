# AGENTS.md

React 19 + Vite 7 PWA for playing "Sam", a Vietnamese card game. Multiplayer has **no backend server** — all shared state lives in Ably LiveObjects. UI text is localized (Vietnamese/English) via `src/logic/i18n.ts` + `src/hooks/useI18n.ts`.

## Commands

- `npm run dev` — Vite dev server (`--host`, exposes on LAN).
- `npm run build` — `tsc -b && vite build`. This is the typecheck; there is no separate typecheck script.
- `npm run lint` — ESLint flat config (`eslint.config.js`).
- `npm run generate-pwa-assets` — regenerate PWA icons/splash screens from `public/logo.svg` (config: `pwa-assets.config.ts`). Run only when the logo changes; output is committed under `public/`.
- There is **no test framework** and no test files. Do not invent `npm test`.

## Critical gotchas

- **The pre-commit hook mutates every commit** (`.husky/pre-commit`): it runs `npm run build`, then `./bump-version.sh` (bumps the patch version in `package.json` and runs `npm install`), then `git add -u`. So commits are slow, fail if the build fails, and always change the version. `git add -u` stages modified tracked files only — explicitly `git add` any new files before committing.
- When committing **only docs/specs** (no code changes), use `git commit --no-verify` to skip the hook so it does not bump the version or run a needless build.
- `vite.config.ts` runs `git rev-parse --short HEAD` at config load and injects `__APP_VERSION__` from `process.env.npm_package_version`. Use the npm scripts, not `vite` directly, and build inside the git repo.
- Path aliases: use `@hooks/*` and `@logic/*` (declared in both `vite.config.ts` and `tsconfig.app.json`). A bare `@/*` alias exists in Vite only and will fail `tsc` — don't use it.
- Tailwind is v4 via the `@tailwindcss/vite` plugin. There is no `tailwind.config.js`; global CSS starts with `@import "tailwindcss";` in `src/index.css`.
- Global ambient types (`Table`, `Game`, `Player`, `Card`, `GameState`, `PlayerAction`, …) live in `src/type.d.ts` — use them without importing.

## Architecture

- `src/logic/*` — pure, framework-free game rules. Functions take/return `Table`/`Game`; no I/O. Most game behavior (turns, tigers, chip settlement) is here and in `logic/game.ts`'s `ActionDef`.
- `src/hooks/*` — Zustand stores (module-level singletons via `create()`) that wire logic to React and Ably. `useAppData` is the Ably client; `useLocalGame`/`useLocalPlayer` persist to `localStorage` under `sam.*` keys.
- i18n: `src/locales/*` holds the `vi`/`en` dictionaries (`vi` is the key source of truth; `en` must satisfy the same key set). `logic/i18n.ts` is framework-free (types, `translate`, `detectLocale`, a module-level `t()` used by the logic layer); `hooks/useI18n.ts` owns the locale, persists it under `sam.locale`, and syncs `<html lang>` + the logic-layer locale.
- Realtime data model: a root Ably LiveMap on channel `sam.lobby` with key `tables`; each table is a nested LiveMap whose values are **JSON-stringified** and parsed with helpers in `logic/util.ts` (`stringifyValues`, `parseTable`). Read by subscribing to the LiveMap, write via `channel.objects.batch`.
- `src/components/*` — grouped by flow: `Credentials` (player + Ably API key setup) → `Tables` → `GamePlayer`. `Lobby.tsx` switches between them based on init state.
- Playing cards render through the vendored custom elements `<card-item>` / `<card-list>` from `src/lib/elements.cardmeister.min.js` (loaded once in `src/main.tsx`); don't reintroduce it elsewhere.

## Runtime setup

- The app requires an Ably API key, pasted by the user on first run. It is base64-encoded and stored in `localStorage` as `sam.apiKey` (`encodeApiKey`/`decodeApiKey` in `logic/util.ts`) because raw keys contain characters some browsers mishandle. It can also be passed via `?apiKey=` (and `tblId`/`tblPw` for table links); `InitAppData.tsx` strips these from the URL after reading.
- PWA uses `registerType: "autoUpdate"`; the service worker is registered in `src/main.tsx`.
- `@vercel/analytics` is wired in `App.tsx`.

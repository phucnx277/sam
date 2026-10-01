# Switch to PeerJS Mode from the Ably Lobby — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lobby control that switches an Ably-mode device to peer mode via the existing `initPeer()` action.

**Architecture:** Pure UI + i18n change. A new bottom-center text link in `Tables.tsx` (mirroring the existing peer→Ably link) calls `initPeer()` from `useAppData`, which already performs the full transport switch. Two locale keys are added.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4. No test framework — verify with `npm run build` (`tsc -b`) and `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-10-01-switch-to-peer-mode-design.md`

---

## File Structure

- `src/locales/vi.ts` — add `lobby.switchToPeer` (key source of truth).
- `src/locales/en.ts` — add the matching English key.
- `src/components/Tables/Tables.tsx` — add the `mode === "ably"` link block in the lobby.

No other files change. `initPeer` is already destructured from `useAppData()` in `Tables.tsx:23` and `t` is already in scope.

---

### Task 1: Add the `lobby.switchToPeer` locale keys

**Files:**
- Modify: `src/locales/vi.ts:33`
- Modify: `src/locales/en.ts:36`

- [ ] **Step 1: Add the Vietnamese key**

In `src/locales/vi.ts`, after the `"lobby.connectWithAbly"` line, add:

```ts
  "lobby.switchToPeer": "Chuyển sang PeerJS",
```

The block should read:

```ts
  "lobby.createTable": "Tạo bàn",
  "lobby.connectWithAbly": "Kết nối Ably",
  "lobby.switchToPeer": "Chuyển sang PeerJS",
```

- [ ] **Step 2: Add the English key**

In `src/locales/en.ts`, after the `"lobby.connectWithAbly"` line, add:

```ts
  "lobby.switchToPeer": "Switch to PeerJS",
```

The block should read:

```ts
  "lobby.createTable": "Create table",
  "lobby.connectWithAbly": "Connect with Ably",
  "lobby.switchToPeer": "Switch to PeerJS",
```

Note: `en` must satisfy the same key set as `vi`; adding the same key to both keeps them in sync.

---

### Task 2: Add the Switch to PeerJS link to the Ably lobby

**Files:**
- Modify: `src/components/Tables/Tables.tsx:260-270`

- [ ] **Step 1: Add the link block**

In `src/components/Tables/Tables.tsx`, the existing peer→Ably block is:

```tsx
            {mode === "peer" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  className="text-sm text-cyan-600 underline"
                  onClick={switchToAbly}
                >
                  {t("lobby.connectWithAbly")}
                </button>
              </div>
            )}
```

Immediately after it (still inside the `!playingTable` lobby `<div>`), add:

```tsx
            {mode === "ably" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  className="text-sm text-cyan-600 underline"
                  onClick={initPeer}
                >
                  {t("lobby.switchToPeer")}
                </button>
              </div>
            )}
```

- [ ] **Step 2: Confirm the referenced names are in scope**

`initPeer` is destructured at `Tables.tsx:23` and `mode` at `Tables.tsx:26`; `t` comes from `useI18n()`. No import changes are needed.

---

### Task 3: Verify and commit

**Files:**
- Verify only; no content changes.

- [ ] **Step 1: Run the build (this is the typecheck)**

Run: `npm run build`
Expected: exits 0; `tsc -b` reports no errors and Vite emits the build.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: exits 0 with no errors.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, open the app, initialize Ably mode.
Expected:
- The Ably lobby shows the `Switch to PeerJS` link at the bottom.
- Clicking it lands in the peer lobby, which shows the `Connect with Ably` link.
- Clicking `Connect with Ably` returns to the credentials screen with the API key prefilled.
- Reloading after switching keeps the app in peer mode (`sam.mode === "peer"`), and the Switch-to-PeerJS link is not shown in peer mode.

- [ ] **Step 4: Commit**

```bash
git add src/locales/vi.ts src/locales/en.ts src/components/Tables/Tables.tsx
git commit -m "feat: switch to PeerJS mode from the Ably lobby"
```

Note: the pre-commit hook runs `npm run build` and bumps the patch version in `package.json`; commits are slow by design. Do not use `--no-verify` (this is a code change).

---

## Self-Review

- **Spec coverage:** UI link (Task 2), label en/vi (Task 1), behavior via existing `initPeer` (Task 2), verification (Task 3) — all spec sections covered.
- **Placeholder scan:** none.
- **Type consistency:** `lobby.switchToPeer` is the same key in `vi.ts`, `en.ts`, and `Tables.tsx`; `initPeer` and `mode` match `useAppData`'s returned names.

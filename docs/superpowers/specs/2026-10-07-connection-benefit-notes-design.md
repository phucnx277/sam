# Connection benefit notes

Date: 2026-10-07
Status: approved (autonomous flow)
Builds on: `2026-10-07-user-friendly-copy-design.md`

## Problem

After de-jargoning, users still see two connection choices ("fast" vs
"compatible") with no explanation of why they would pick one. The choice
appears on the setup screen (`InitAppData`) and in the lobby toggle
(`Tables.tsx`).

## Decision

Add one line of muted helper text under each connection action, on both the
setup screen and the lobby toggle. Text is self-contained (names the mode) so
it reads correctly wherever it appears.

### Benefit claims (verified against behavior)

- **Fast connection** = PeerJS, direct peer-to-peer. Needs no key; lowest lag.
- **Compatible connection** = Ably relay. Needs a free key; works on networks
  that block direct connections.

Not claimed: a shared/global table list. `visibleTables` filters to tables the
player is a member of in both modes, so compatible mode is not described as
"showing all tables".

### New i18n keys (values differ per locale)

- `connection.fastBenefit`
  - en: "Fast connection — no key needed and players connect directly for the lowest lag."
  - vi: "Kết nối nhanh — không cần khóa, các máy nối trực tiếp nên độ trễ thấp nhất."
- `connection.compatibleBenefit`
  - en: "Compatible connection — needs a free key and relays through a server, so it works even on restrictive networks."
  - vi: "Kết nối tương thích — cần khóa miễn phí, truyền qua máy chủ nên vẫn chơi được trên mạng hạn chế."

`vi` is the key source of truth; both dictionaries must define both keys.

### Placement

`src/components/Credentials/InitAppData.tsx`
- Under the submit ("Next") button: `connection.compatibleBenefit`.
- Under the "Play with fast connection" button: `connection.fastBenefit`.

`src/components/Tables/Tables.tsx`
- In the `mode === "peer"` block (switch to compatible): `connection.compatibleBenefit`.
- In the `mode === "ably"` block (switch to fast): `connection.fastBenefit`.

Style: `text-xs text-gray-500 mt-1` (muted, small), matching existing helper text.

## Out of scope

- No change to the in-game "Compatible connection" badge or to connection logic.
- No new icons, tooltips, or layout restructure.

## Verification

- `npm run build` passes (`en` must satisfy the extended `TranslationKey` set).
- `npm run lint` passes.
- Visual check on both screens shows a muted note under each option.

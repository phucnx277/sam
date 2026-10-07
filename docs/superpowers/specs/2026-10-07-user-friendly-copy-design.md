# User-friendly copy: de-jargoning connection terms

Date: 2026-10-07
Status: approved (autonomous flow)

## Problem

Several user-facing strings expose infrastructure names and jargon that mean
nothing to a casual player: **Ably**, **PeerJS**, **API key**, and
**Indirect connection**. These appear on the credentials/setup screen, the
lobby connection toggle, the in-game fallback badge, and table info.

## Decision

Replace infrastructure jargon with plain, benefit-oriented wording while
keeping the functional link to `https://ably.com` (users still must obtain a
key there for the compatible mode).

### Terminology map

| Concept | New English | New Vietnamese |
| --- | --- | --- |
| PeerJS transport | Fast connection | Kết nối nhanh |
| Ably transport | Compatible connection | Kết nối tương thích |
| Ably API key | Connection key | Khóa kết nối |

### String changes (values only; keys unchanged)

`src/locales/en.ts`
- `credentials.apiKeyLabel`: "Your Ably API Key" -> "Your connection key"
- `credentials.apiKeyPlaceholder`: "Ably API key" -> "Paste your connection key"
- `credentials.getKey`: "Get a new key here: " -> "Get a free key at "
- `credentials.playWithoutAbly`: "Play without Ably (PeerJS only)" -> "Play with fast connection"
- `lobby.connectWithAbly`: "Connect with Ably" -> "Switch to compatible connection"
- `lobby.switchToPeer`: "Switch to PeerJS" -> "Switch to fast connection"
- `game.fallbackMode`: "Indirect connection" -> "Compatible connection"
- `table.apiKeyLabel`: "API Key:" -> "Connection key:"

`src/locales/vi.ts`
- `credentials.apiKeyLabel`: "Ably API Key của bạn" -> "Khóa kết nối của bạn"
- `credentials.apiKeyPlaceholder`: "Ably API key" -> "Dán khóa kết nối"
- `credentials.getKey`: "Lấy key mới tại: " -> "Lấy khóa miễn phí tại "
- `credentials.playWithoutAbly`: "Chơi không cần Ably (chỉ PeerJS)" -> "Chơi với kết nối nhanh"
- `lobby.connectWithAbly`: "Kết nối Ably" -> "Chuyển sang kết nối tương thích"
- `lobby.switchToPeer`: "Chuyển sang PeerJS" -> "Chuyển sang kết nối nhanh"
- `game.fallbackMode`: "Kết nối gián tiếp" -> "Kết nối tương thích"
- `table.apiKeyLabel`: "API Key:" -> "Khóa kết nối:"

## Out of scope

- The literal link-format example `?apiKey=xxx&tblId=xxx` in
  `Tables.tsx` is a functional hint and stays.
- Internal code identifiers (`mode`, `isPeerFallback`, `apiKey`, function
  names, URL params) are unchanged.
- No key additions/removals, so `en`/`vi` key parity is preserved.

## Verification

- `npm run build` passes (it type-checks the `satisfies Record<TranslationKey, string>`).
- `npm run lint` passes.
- Manual scan confirms no remaining user-facing "Ably"/"PeerJS"/"API key"/"Indirect connection".

# Peer-Mode Reconnect, Presence, and Spectators

## Problem

In peer mode the host relays the authoritative `Table` and masks every
non-viewer hand (`maskTableFor`). Two gaps remain around players leaving and
returning:

1. When a client's connection drops, the host removes it from `clientConns`
   (`usePeerData.ts` `conn.on("close")`) but does not touch the game. The
   player's seat stays "active" (`isReady`, `isAway: false`), so nobody else can
   tell they are gone, and if it is their turn the game stalls (auto-play only
   runs in the current player's own browser).
2. A returning player is always resumed by `bridge.onJoin`'s `resumePlayer`
   call, even when a *different* game has started in the meantime. Reconnecting
   into a new game would make them active with a stale/empty hand.

Each client also keeps `latestTable` only in memory, so after a reload the
client cannot tell the host which game it was in.

## Goal

- Let players keep a local copy of their own table metadata so a reload can
  rejoin and tell the host which game it left.
- Show who is disconnected so the remaining players know.
- On rejoin, sync from the host. If it is the **same** game the player was in,
  resume and keep playing. If it is a **new** game, let them watch until it
  ends, then explicitly join the next game.
- Keep the existing hand privacy: never persist or render another player's
  cards.
- Keep rejecting new players when the table is full.

## Non-goals

- Ably mode. Its shared lobby and whole-table LiveObjects are unchanged.
- Anti-cheat / Byzantine clients.
- Perfect host-failover presence reconciliation. A new host trusts the
  reconnecting `hello` frames it receives; members that were already offline
  keep their last known flag until they reconnect.
- Full-table event-log replay/resync. Resume is a single host snapshot.

## Key constraints

- The host is the only writer of the authoritative table; clients send action
  requests. Presence must therefore be host-mediated.
- `hello` already exists and already carries `cards` and `gameId`
  (`logic/peer.ts`). It is the natural "send me the up-to-date table" request;
  the host replies with `snapshot`.
- Turn rotation already treats `isReady && !isAway` as "present"
  (`findNextActivePlayerId`, `startGame`, `isGameEnded`, …). `isAway` is the
  single "skip this seat" flag.
- `maskTableFor` spreads each `GamePlayer`, so any new presence flag rides
  along in broadcasts automatically.
- There is no test framework. Verification is `npm run build` + `npm run lint`
  + manual multi-browser checks.

## Data model

`src/type.d.ts`:

- `GamePlayer.isDisconnected?: boolean` — host believes the connection is down.
- `LocalGame` gains `tableId?: string` (and keeps `playerId`, `gameId`,
  `cards`). Only the local player's own data is stored; opponent hands are
  never written to disk.

Presence semantics:

| state | `isDisconnected` | `isAway` |
| --- | --- | --- |
| active player | false | false |
| connection dropped (after grace) | true | true |
| rejoined same game | false | false |
| rejoined during a new game (spectator) | false | true |
| explicit "join next game" while waiting | false | false |

## Architecture

### 1. Local metadata persistence

`hooks/useLocalGame.ts` already persists `{ playerId, gameId, cards }` under
`sam.playingGame`. Extend it with `tableId` (written from `GamePlayer.tsx`
alongside the existing save) and a `clearLocalGame()` action. `leaveTable` /
`removeTable` clear it.

`usePeerData.joinHost`'s `conn.on("open")` `hello` sources its `gameId` /
`cards` from the in-memory `latestTable` when available, otherwise from
`useLocalGame.getState().localGame` **only when `localGame.tableId === tableId`**.
This is what lets a reloaded client tell the host which game it left and lets a
promoted host recover a hand it had masked.

Nothing is rendered from local storage: the table appears only after the host
`snapshot` arrives.

### 2. Host presence detection

Add module-level `presenceTimers: Map<string /* playerId */, number>` and
`PLAYER_AWAY_GRACE_MS = 10000` (mirrors `HOST_GRACE_MS`).

- On the host's `conn.on("close")` / `conn.on("error")`: drop the conn from
  `clientConns` and schedule a timer for that player id. If the player is not a
  member, or is the host, skip.
- On firing (and only if the same player has no live conn), apply
  `markPlayerDisconnected(table, playerId)` (below), bump `rev`, broadcast the
  masked table, and fire `callbacks.onUpdate`.
- On `hello` for that player id, clear the pending timer.

Grace-timer state is cleared in `clearTimers()` / `stop()`.

### 3. Pure helpers (`logic/table.ts`)

- `markPlayerDisconnected(table, playerId): Table`
  - set `isDisconnected = true`, `isAway = true`.
  - if the game is in progress and `currentPlayerId === playerId`, advance
    `currentPlayerId` past them with `findNextActivePlayerId` and reset
    `turnStartTs`/`turnEndTs` (same pattern as `promoteHost`).
- `markPlayerReconnected(table, playerId): Table` — clear `isDisconnected`.
- `applyRejoin(table, playerId, { gameId, cards }): Table`
  - clear `isDisconnected`.
  - `resume = game.state === "waiting" || gp.cards.length > 0`.
    - `resume` → clear `isAway`; additionally adopt `cards` only when
      `gameId === game.id`, the game is in progress, and the host copy is
      missing or `hasHiddenCards(...)` (failover recovery; normal reconnects
      never overwrite authoritative hands).
    - otherwise → keep `isAway = true` (spectator) and ignore `cards`.
  - The `gp.cards.length > 0` test is the reliable "was dealt into this game"
    signal: `startGame` gives away players `cards: []`, and an active player
    never reaches zero cards mid-game (that ends it).

Extend `ready` in `ActionDef` (`logic/game.ts`): toggling ready **on** while
`isAway` joins the next game (`isAway = false`, `isReady = true`). This is the
"explicit rejoin each game" action for spectators. Otherwise it toggles
`isReady` as today.

### 4. Rejoin protocol

`PeerCallbacks.onJoin` becomes
`(player, table, rejoin: { gameId?: string; cards?: Card[] }) => Table | null`.

`bridge.onJoin`:

- not present → keep the existing full-check + `addTablePlayer`.
- present → `applyRejoin(table, player.id, rejoin)`.

The host's `hello` handler drops its bespoke card-adoption block and simply
lets the `onJoin` result go through the existing bump-rev/broadcast path.
`validateJoin` still runs first, so a full table rejects before any of this.

### 5. UI

- `PlayerInfo.tsx`: show an "offline" badge when `isDisconnected`; show a
  "watching" badge when `isAway && !isDisconnected`; dim away players.
- `Actions.tsx` / `PlayingTable.tsx`: when the local player is `isAway`, do
  not render play/pass/tiger controls; show a "watching" notice, and in the
  `waiting` state render a single "join next game" button that dispatches
  `ready`. The auto-action interval already filters `!gp.isAway`.
- No new overlay; reuse existing layout.

### 6. Table full

`validateJoin` (`logic/table.ts`) already returns `"full"` for a non-member
when `game.players.length >= playerLimit`; the host sends `reject`, stops the
peer session, and the lobby shows `error.peerFull`. Members reconnecting (even
when full) are allowed because `alreadyPresent` short-circuits. No change;
covered by a manual check.

## Files

- `src/type.d.ts` — `GamePlayer.isDisconnected`, `LocalGame.tableId`.
- `src/logic/table.ts` — `markPlayerDisconnected`, `markPlayerReconnected`,
  `applyRejoin`.
- `src/logic/game.ts` — `ready` clears `isAway` when joining.
- `src/logic/peer.ts` — no new message type; `hello` parsing unchanged.
- `src/hooks/usePeerData.ts` — presence timers, `hello` metadata fallback,
  `onJoin` rejoin payload, rejoin handling replacement.
- `src/hooks/useAppData.ts` — `onJoin` signature + `applyRejoin`; clear local
  game on leave/remove.
- `src/hooks/useLocalGame.ts` — `tableId`, `clearLocalGame`.
- `src/components/GamePlayer/GamePlayer.tsx` — persist `tableId`.
- `src/components/GamePlayer/PlayerInfo.tsx` — presence badges.
- `src/components/GamePlayer/Actions.tsx` — spectator gating + join button.
- `src/locales/vi.ts` + `src/locales/en.ts` — new keys (below).

## i18n

Add to `vi.ts` (source of truth) and `en.ts`:

```
game.disconnected
game.watching
game.joinNextGame
```

## Failure handling / edge cases

- **Reconnect within grace**: pending timer cleared on `hello`; no away flip.
- **Reconnect into a new game**: `cards.length === 0` → spectator; `isAway`
  stays until they press "join next game" in `waiting`.
- **Current player drops**: after grace, turn advances; game continues.
- **Host failover while a player is offline**: the promoted host may carry a
  stale `isDisconnected`; when the player reconnects and sends `hello`, flags
  are corrected and, if same game, their hand is recovered from `hello.cards`.
- **Removed player / table gone**: local metadata is cleared on leave/remove;
  a stale `tableId` is ignored when joining a different table.

## Verification

- `npm run build` (`tsc -b && vite build`) passes.
- `npm run lint` passes.
- Manual, two/three-browser peer session:
  1. Start a game; close one non-host tab. After the grace period the others
     see that player as disconnected, their turns are skipped, and play
     continues.
  2. Reopen the tab while the same game is in progress: they rejoin, see their
     preserved hand, and can take turns again.
  3. Reopen after a new game has started: they watch (no controls) until it
     ends; in the next `waiting` state they press "join next game" and are
     dealt into the following game.
  4. A stranger joining a full table is rejected; a disconnected member
     rejoining the same full table is allowed.
  5. `localStorage` contains only the local player's own metadata
     (`sam.playingGame`); no opponent cards, and no table is rendered before
     the host snapshot.
- No test framework exists; no automated tests are added.

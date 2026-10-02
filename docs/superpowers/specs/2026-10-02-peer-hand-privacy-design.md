# Peer-Mode Hand Privacy

## Problem

In peer mode every client receives the full authoritative `Table` on each
host broadcast (`snapshot` / `update`), including every `GamePlayer.cards` and
`selectedCards`. Three consequences leak hidden hands to non-hosts:

1. The whole table array is persisted to `localStorage["sam.tables"]`
   (`savePeerTables`), readable by anyone with devtools.
2. The lobby renders a table list from that data, even though peer tables are
   only reachable by direct link/QR.
3. The peer protocol itself ships all hands to every client.

The host is trusted (someone must adjudicate), but no other player should be
able to read a hand that is not their own.

## Goal

- Stop persisting peer tables to `localStorage` and purge the stale key.
- Do not render a table list in peer-mode lobby.
- Mask every peer broadcast per recipient so a client only ever receives its
  own hand (plus public information), while the host keeps the full table.
- Keep host failover working: a promoted host must be able to reconstruct all
  hands.

## Non-goals

- Ably mode. In ably mode the shared `sam.lobby` LiveObjects still stores whole
  tables and the lobby list is still shown; that is a pre-existing, separate
  design (players share an API key). This spec only changes the peer transport
  and the peer-mode lobby.
- Anti-cheat / Byzantine clients. A client can still lie about its own hand;
  that is out of scope.
- Ably fallback polling in peer mode (peer mode does not poll Ably).

## Architecture

The **host is the only writer** of the authoritative in-memory `Table`. Clients
never send tables; they send **action requests**. The host applies the action
with the existing pure `ActionDef` handlers and broadcasts a **masked** table to
each recipient.

### Masking

New pure helper `maskTableFor(table, viewerId)` in `logic/table.ts`:

- While `game.state !== "ended"`, replace every other player's `cards` and
  `selectedCards` with placeholder cards (`hidden: true`, unique rank per index)
  that preserve hand **length** so the UI still renders the correct number of
  card backs.
- At `game.state === "ended"`, return the table unmasked (final hands are
  revealed, and `findTigerAndKiller` runs on clients).
- `lastGame` is left untouched (a finished, already-revealed game).

`Card.hidden?: boolean` is added to `type.d.ts`. The `hidden` flag also lets the
host detect that one of its copies is a placeholder and should be replaced.

### Action protocol

Replace client→host full-table `update` with:

```ts
{ type: "action"; playerId: string; action: PlayerAction; data?: unknown; rev: number; from: string }
```

`data` carries `{ selectedCards }` for `play` (and is ignored by the others).
The host resolves `playerId` against the connection it arrived on (spoof guard),
applies `applyAction` (new pure helper wrapping `ActionDef[action].handleAction`)
to its authoritative table, increments `rev`, and broadcasts masked updates.

`ActionDef.tiger`/`resetSession` lose their `window.confirm` calls so actions are
safe to apply on the host; the client confirms `resetSession` in `Actions.tsx`
(`tiger` already uses `TwoStepButton`).

### Client UX / responsiveness

`useAppData.dispatchAction(action, data)`:

- If a peer session exists:
  - host → `usePeerData.sendAction` applies authoritatively;
  - client → optimistically apply non-deal actions locally (immediate feedback,
    stops the auto-action timer re-firing), then `sendAction` to the host.
  - `startGame`, `newGame`, `resetSession` are **not** applied locally: they
    deal cards, and only the host may generate hands.
- If no peer session exists (Ably-only fallback), apply locally and
  `updateTable` as before.

### Host failover

A promoted host starts from its masked `latestTable`. To recover hidden hands,
each client's `hello` now carries its own `cards` (from its own unmasked entry)
and `gameId`. On `hello` the host adopts a player's cards only when its copy is
missing or flagged `hidden`, so normal reconnects never overwrite authoritative
hands with stale client copies.

## Files

- `src/type.d.ts` — `Card.hidden?: boolean`.
- `src/logic/table.ts` — `maskTableFor`.
- `src/logic/game.ts` — `applyAction`; remove `window.confirm` from `tiger` and
  `resetSession`.
- `src/logic/peer.ts` — `action` message (+ `hello.cards`/`gameId`), parsing.
- `src/hooks/usePeerData.ts` — per-connection player map, masked broadcast,
  `sendAction`, host action application, hello hand recovery, host-only
  `sendUpdate`.
- `src/hooks/useAppData.ts` — remove `sam.tables` persistence + purge, hide peer
  table list data, `dispatchAction`, persist host actions in ably mode.
- `src/components/GamePlayer/Actions.tsx` — dispatch actions; confirm reset.
- `src/components/Tables/PlayingTable.tsx` — `dispatchAction`.
- `src/components/Tables/Tables.tsx` — no table list in peer mode.

## Verification

- `npm run build` (`tsc -b && vite build`) passes.
- `npm run lint` passes.
- Manual, two/three browser peer session:
  1. Create + join a peer table; start a game.
  2. In a non-host client, inspect `localStorage` (no `sam.tables`) and the
     store/network: opponents' `cards` are `hidden` placeholders; own hand is
     real. Play/pass/tiger still work.
  3. Peer lobby shows no table list, but create/paste/scan work.
  4. Kill the host, elect a new one, confirm the game continues and the new host
     has real hands (hello recovery).
- No test framework exists; no automated tests are added.

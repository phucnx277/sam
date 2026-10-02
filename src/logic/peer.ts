import type { JoinRejectReason } from "./table";

export const HOST_PEER_PREFIX = "sam";
export const CLIENT_PEER_PREFIX = "sam-c";

export const tablePeerId = (tableId: string): string =>
  `${HOST_PEER_PREFIX}-${tableId}`;

export const clientPeerId = (playerId: string): string =>
  `${CLIENT_PEER_PREFIX}-${playerId}`;

export type PeerMsg =
  | {
      type: "hello";
      playerId: string;
      name: string;
      password: string;
      cards?: Card[];
      gameId?: string;
    }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string }
  | {
      type: "action";
      playerId: string;
      action: PlayerAction;
      data?: unknown;
      rev: number;
      from: string;
    }
  | { type: "reject"; reason: JoinRejectReason }
  | { type: "present"; playerId: string; epoch: number; round: number }
  | {
      type: "vote";
      voterId: string;
      candidateId: string;
      epoch: number;
      round: number;
    };

const PlayerActionSet = new Set<string>([
  "startGame",
  "newGame",
  "ready",
  "star",
  "ask",
  "tiger",
  "play",
  "pass",
  "removePlayers",
  "transferHost",
  "resetSession",
]);

const isTableLike = (value: unknown): value is Table => {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.hostId !== "string") return false;
  if (typeof t.game !== "object" || t.game === null) return false;
  if (!Array.isArray(t.players)) return false;
  return true;
};

export const parsePeerMsg = (data: unknown): PeerMsg | null => {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  const from = typeof msg.from === "string" ? msg.from : "";
  switch (msg.type) {
    case "hello":
      if (typeof msg.playerId !== "string" || typeof msg.name !== "string") {
        return null;
      }
      return {
        type: "hello",
        playerId: msg.playerId,
        name: msg.name,
        password: typeof msg.password === "string" ? msg.password : "",
        cards: Array.isArray(msg.cards) ? (msg.cards as Card[]) : undefined,
        gameId: typeof msg.gameId === "string" ? msg.gameId : undefined,
      };
    case "snapshot":
      if (
        !isTableLike(msg.table) ||
        typeof msg.rev !== "number" ||
        !Number.isFinite(msg.rev)
      ) {
        return null;
      }
      return { type: "snapshot", table: msg.table, rev: msg.rev, from };
    case "update":
      if (
        !isTableLike(msg.table) ||
        typeof msg.rev !== "number" ||
        !Number.isFinite(msg.rev)
      ) {
        return null;
      }
      return { type: "update", table: msg.table, rev: msg.rev, from };
    case "action":
      if (
        typeof msg.playerId !== "string" ||
        typeof msg.action !== "string" ||
        !PlayerActionSet.has(msg.action) ||
        typeof msg.rev !== "number" ||
        !Number.isFinite(msg.rev)
      ) {
        return null;
      }
      return {
        type: "action",
        playerId: msg.playerId,
        action: msg.action as PlayerAction,
        data: msg.data,
        rev: msg.rev,
        from,
      };
    case "reject":
      if (msg.reason !== "password" && msg.reason !== "full") {
        return null;
      }
      return { type: "reject", reason: msg.reason };
    case "present":
      if (
        typeof msg.playerId !== "string" ||
        typeof msg.epoch !== "number" ||
        !Number.isFinite(msg.epoch) ||
        typeof msg.round !== "number" ||
        !Number.isFinite(msg.round)
      ) {
        return null;
      }
      return {
        type: "present",
        playerId: msg.playerId,
        epoch: msg.epoch,
        round: msg.round,
      };
    case "vote":
      if (
        typeof msg.voterId !== "string" ||
        typeof msg.candidateId !== "string" ||
        typeof msg.epoch !== "number" ||
        !Number.isFinite(msg.epoch) ||
        typeof msg.round !== "number" ||
        !Number.isFinite(msg.round)
      ) {
        return null;
      }
      return {
        type: "vote",
        voterId: msg.voterId,
        candidateId: msg.candidateId,
        epoch: msg.epoch,
        round: msg.round,
      };
    default:
      return null;
  }
};

export const shouldApplyRevision = (
  incoming: number,
  lastRev: number,
): boolean => Number.isFinite(incoming) && incoming > lastRev;

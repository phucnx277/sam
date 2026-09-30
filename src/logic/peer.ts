export const HOST_PEER_PREFIX = "sam";
export const CLIENT_PEER_PREFIX = "sam-c";

export const tablePeerId = (tableId: string): string =>
  `${HOST_PEER_PREFIX}-${tableId}`;

export type PeerMsg =
  | { type: "hello"; playerId: string; name: string }
  | { type: "snapshot"; table: Table; rev: number; from: string }
  | { type: "update"; table: Table; rev: number; from: string };

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
      return { type: "hello", playerId: msg.playerId, name: msg.name };
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
    default:
      return null;
  }
};

export const shouldApplyRevision = (
  incoming: number,
  lastRev: number,
): boolean => Number.isFinite(incoming) && incoming > lastRev;

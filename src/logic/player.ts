import { generateId } from "./util";

export const newPlayer = (name: string): Player => {
  name = name.trim();
  const isAdmin = name.endsWith("<admin>");
  if (isAdmin) {
    name = name.replace("<admin>", "");
  }
  return { id: generateId("player"), name, isAdmin };
};

export const divideGamePlayers = (
  players: GamePlayer[],
  targetPlayerId: string,
): { opponents: GamePlayer[]; targetGamePlayer: GamePlayer } => {
  players = rotateGamePlayers(players, targetPlayerId);
  const targetGamePlayer = players.splice(0, 1)[0];
  const opponents = players;

  return { targetGamePlayer, opponents };
};

// current player will always be first
export function rotateGamePlayers(
  players: GamePlayer[],
  targetPlayerId: string,
): GamePlayer[] {
  players = [...players];
  const targetGPIdx = players.findIndex((item) => item.id === targetPlayerId);
  const movedPlayers = players.splice(0, targetGPIdx);
  return [...players, ...movedPlayers];
}

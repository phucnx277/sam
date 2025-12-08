import { generateId } from "./util";

export const newPlayer = (pattern: string): Player => {
  const player: Player = {
    id: "",
    name: "",
  };
  pattern = pattern.trim();
  const data = pattern.split("@");

  player.name = data[0];
  player.id = data[1]?.startsWith("player") ? data[1] : generateId("player");
  player.isAdmin = data[2] === "admin";

  return player;
};

export const exportPlayerInfo = (player: Player): string => {
  let output = `${player.name}@${player.id}`;
  if (player.isAdmin) {
    output += `@admin`;
  }
  return output;
};

import { create } from "zustand";
const LS_PLAYER_KEY = "sam.player";

const playerStore = create<{
  localPlayer: Player | null;
  setLocalPlayer: (data: Player) => void;
}>((set) => ({
  localPlayer: getLocalPlayer(),
  setLocalPlayer: (data: Player) => {
    setLocalPlayer(data);
    set({ localPlayer: data });
  },
}));

function getLocalPlayer() {
  let player: Player | null = null;
  const stored = localStorage.getItem(LS_PLAYER_KEY);
  if (!stored) return player;
  try {
    player = JSON.parse(stored);
  } catch {
    player = null;
  }
  return player;
}

function setLocalPlayer(player: Player) {
  const stored: Partial<Player> = { ...player };
  localStorage.setItem(LS_PLAYER_KEY, JSON.stringify(stored));
}

const useLocalPlayer = playerStore;

export default useLocalPlayer;

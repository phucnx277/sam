import { create } from "zustand";
const LS_PLAYING_GAME_KEY = "sam.playingGame";

const gameStore = create<{
  localGame: LocalGame | null;
  setLocalGame: (data: LocalGame) => void;
}>((set) => ({
  localGame: getLocalGame(),
  setLocalGame: (data: LocalGame) => {
    setLocalGame(data);
    set({ localGame: data });
  },
}));

function getLocalGame() {
  let game: LocalGame | null = null;
  const stored = localStorage.getItem(LS_PLAYING_GAME_KEY);
  if (!stored) return game;
  try {
    game = JSON.parse(stored);
  } catch {
    game = null;
  }
  return game;
}

function setLocalGame(game: LocalGame) {
  localStorage.setItem(LS_PLAYING_GAME_KEY, JSON.stringify(game));
}

const useLocalGame = gameStore;

export default useLocalGame;

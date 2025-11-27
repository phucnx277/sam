import type React from "react";
import { create } from "zustand";
const LS_PLAYING_GAME_KEY = "sam.playingGame";

const gameStore = create<{
  localGame: LocalGame | null;
  localCards: Card[];
  setLocalGame: (data: LocalGame) => void;
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>;
}>((set) => ({
  localGame: getLocalGame(),
  localCards: [],
  setLocalGame: (data: LocalGame) => {
    setLocalGame(data);
    set({ localGame: data });
  },
  setLocalCards: (fn: Card[] | ((cards: Card[]) => Card[])) => {
    set((state) => {
      let data: Card[] = fn as Card[];
      if ("function" === typeof fn) {
        data = fn(state.localCards);
      }
      return { localCards: data };
    });
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

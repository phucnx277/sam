import { create } from "zustand";

const BUBBLE_TTL_MS = 4000;
const MAX_BUBBLE_MESSAGES = 2;

type ChatBubble = {
  messages: ChatMessage[];
};

const bubbleTimers = new Map<string, number>();

const clearBubbleTimer = (playerId: string) => {
  const timer = bubbleTimers.get(playerId);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  bubbleTimers.delete(playerId);
};

const chatStore = create<{
  isOpen: boolean;
  bubbles: Record<string, ChatBubble>;
  open: () => void;
  close: () => void;
  pushBubble: (message: ChatMessage) => void;
  dismissBubble: (playerId: string) => void;
  clearBubbles: () => void;
}>((set, get) => ({
  isOpen: false,
  bubbles: {},
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  pushBubble: (message) => {
    const prev = get().bubbles[message.playerId]?.messages ?? [];
    const messages = [...prev, message].slice(-MAX_BUBBLE_MESSAGES);
    set((state) => ({
      bubbles: { ...state.bubbles, [message.playerId]: { messages } },
    }));
    clearBubbleTimer(message.playerId);
    bubbleTimers.set(
      message.playerId,
      window.setTimeout(
        () => get().dismissBubble(message.playerId),
        BUBBLE_TTL_MS,
      ),
    );
  },
  dismissBubble: (playerId) => {
    clearBubbleTimer(playerId);
    set((state) => {
      if (!(playerId in state.bubbles)) return state;
      const bubbles = { ...state.bubbles };
      delete bubbles[playerId];
      return { bubbles };
    });
  },
  clearBubbles: () => {
    bubbleTimers.forEach((timer) => window.clearTimeout(timer));
    bubbleTimers.clear();
    set({ bubbles: {} });
  },
}));

const useChat = chatStore;

export default useChat;

import { generateId } from "./util";

export const MAX_CHAT_LENGTH = 200;
export const MAX_CHAT_MESSAGES = 200;
// Keep the chat snapshots well under Ably's 64 KiB per-operation limit, since
// the whole `game` value (including chat) is written as one LiveMap value.
export const MAX_CHAT_BYTES = 24000;

const chatByteSize = (messages: ChatMessage[]): number =>
  new TextEncoder().encode(JSON.stringify(messages)).length;

export const normalizeChatText = (text: string): string =>
  Array.from(text.replace(/\s+/g, " ").trim())
    .slice(0, MAX_CHAT_LENGTH)
    .join("");

export const makeTextMessage = (
  player: Player,
  text: string,
): ChatMessage | null => {
  const normalized = normalizeChatText(text);
  if (!normalized) return null;
  return {
    id: generateId("msg"),
    playerId: player.id,
    name: player.name,
    text: normalized,
    ts: Date.now(),
  };
};

export const appendChatMessage = (
  table: Table,
  message: ChatMessage,
): Table => {
  const messages = [...(table.game.chat ?? []), message];
  while (
    messages.length > 1 &&
    (messages.length > MAX_CHAT_MESSAGES ||
      chatByteSize(messages) > MAX_CHAT_BYTES)
  ) {
    messages.shift();
  }
  return {
    ...table,
    game: { ...table.game, chat: messages },
  };
};

export const chatMessageText = (message: ChatMessage): string =>
  message.text ?? "";

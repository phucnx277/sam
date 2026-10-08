import { useEffect, useRef, useState } from "react";
import useAppData from "@hooks/useAppData";
import useChat from "@hooks/useChat";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { chatMessageText, MAX_CHAT_LENGTH } from "@logic/chat";

const TableChat = () => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { playingTable, sendChat } = useAppData();
  const isOpen = useChat((s) => s.isOpen);
  const open = useChat((s) => s.open);
  const close = useChat((s) => s.close);
  const bubbles = useChat((s) => s.bubbles);
  const pushBubble = useChat((s) => s.pushBubble);
  const clearBubbles = useChat((s) => s.clearBubbles);
  const [draft, setDraft] = useState("");
  const notifiedIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chat = playingTable?.game.chat ?? [];
  const lastMessage = chat[chat.length - 1];

  useEffect(() => {
    notifiedIdRef.current = lastMessage?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable?.id]);

  useEffect(() => {
    if (!lastMessage) return;
    if (isOpen || lastMessage.id === notifiedIdRef.current) {
      notifiedIdRef.current = lastMessage.id;
      return;
    }
    notifiedIdRef.current = lastMessage.id;
    if (lastMessage.playerId === localPlayer?.id) return;
    pushBubble(lastMessage);
  }, [lastMessage, isOpen, localPlayer?.id, pushBubble]);

  useEffect(() => {
    if (isOpen) clearBubbles();
  }, [isOpen, clearBubbles]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isOpen, lastMessage?.id]);

  const visibleIds = new Set(
    (playingTable?.game.players ?? [])
      .filter(
        (player) =>
          player.id === localPlayer?.id ||
          playingTable?.game.state !== "waiting" ||
          player.isReady,
      )
      .map((player) => player.id),
  );
  const fallbackToasts = Object.entries(bubbles).filter(
    ([senderId]) => !visibleIds.has(senderId),
  );

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void sendChat(text);
    setDraft("");
  };

  return (
    <>
      {isOpen && (
        <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="relative bg-white flex flex-col p-3 lg:p-4 rounded-lg shadow-2xl shadow-gray-400 w-[26rem] max-w-[92%] max-h-[85%]">
            <div className="text-center text-lg font-semibold">
              {t("chat.title")}
            </div>
            <span
              className="absolute text-2xl right-4 top-2 font-normal cursor-pointer text-gray-500 hover:text-gray-800 active:text-gray-800 focus:text-gray-800"
              onClick={close}
            >
              {"×"}
            </span>

            <div
              ref={listRef}
              className="mt-2 flex-1 overflow-y-auto pr-1 flex flex-col gap-y-2 min-h-[8rem] max-h-[50vh]"
            >
              {chat.length === 0 && (
                <div className="text-center text-sm text-gray-400">
                  {t("chat.empty")}
                </div>
              )}
              {chat.map((message) => {
                const mine = message.playerId === localPlayer?.id;
                return (
                  <div key={message.id} className="text-sm break-words">
                    <span
                      className={
                        mine ? "font-semibold text-cyan-700" : "font-semibold"
                      }
                    >
                      {message.name}
                    </span>
                    {": "}
                    <span>{chatMessageText(message)}</span>
                  </div>
                );
              })}
            </div>

            <form className="mt-2 flex gap-x-2" onSubmit={submitText}>
              <input
                className="flex-1 min-w-0 !px-2 border border-gray-300 rounded-sm"
                value={draft}
                maxLength={MAX_CHAT_LENGTH}
                placeholder={t("chat.placeholder")}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="submit"
                className="!px-3 border border-green-600 bg-green-600 text-white rounded-sm disabled:opacity-50"
                disabled={!draft.trim()}
              >
                {t("chat.send")}
              </button>
            </form>
          </div>
        </div>
      )}

      {!isOpen && fallbackToasts.length > 0 && (
        <div className="fixed z-20 top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-y-2 max-w-[90%] pointer-events-none">
          {fallbackToasts.map(([senderId, bubble]) => (
            <button
              key={senderId}
              type="button"
              className="chat-bubble pointer-events-auto max-w-[90vw] bg-gray-800/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg text-left"
              onClick={open}
            >
              {bubble.messages.map((message) => (
                <div key={message.id} className="break-words">
                  <span className="font-semibold">{message.name}</span>
                  {": "}
                  <span>{chatMessageText(message)}</span>
                </div>
              ))}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default TableChat;

import { useEffect, useRef, useState } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { chatMessageText, MAX_CHAT_LENGTH } from "@logic/chat";

const TableChat = ({
  isOpen,
  onOpen,
  onClose,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { playingTable, sendChat } = useAppData();
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<ChatMessage | null>(null);
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
    setToast(lastMessage);
  }, [lastMessage, isOpen, localPlayer?.id]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isOpen, lastMessage?.id]);

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
              onClick={onClose}
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

      {!isOpen && toast && (
        <div
          className="fixed z-20 top-4 left-1/2 -translate-x-1/2 max-w-[90%] bg-gray-800/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg cursor-pointer"
            onClick={() => {
              setToast(null);
              onOpen();
            }}
        >
          <span className="font-semibold">{toast.name}</span>
          {": "}
          <span>{chatMessageText(toast)}</span>
        </div>
      )}
    </>
  );
};

export default TableChat;

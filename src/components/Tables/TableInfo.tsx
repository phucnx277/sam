import useAppData from "@hooks/useAppData";
import { useCallback, useState } from "react";

const TableInfo = ({ onClose }: { onClose: () => void }) => {
  const { playingTable, getApiKey } = useAppData();
  const apiKey = getApiKey("original");
  const [textCopies, setTextCopies] = useState({
    url: "Copy link",
    key: "Copy",
  });

  const copy = useCallback(
    (type: "url" | "key") => {
      const encodedApiKey = getApiKey("encoded");
      let content = encodedApiKey;
      let textCopy = "Copied!";
      if (!navigator.clipboard) {
        return;
      }
      if (type === "url") {
        content = `${window.location.href}?apiKey=${encodedApiKey}&tblId=${playingTable!.id}&tblPw=${playingTable!.password}`;
        textCopy = "Link copied!";
      }
      navigator.clipboard
        .writeText(content)
        .then(() => {
          setTextCopies({ ...textCopies, [type]: textCopy });
        })
        .catch((e) => {
          alert(e);
        });
    },
    [playingTable, getApiKey, textCopies],
  );

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[25rem] max-w-[92%] gap-y-1">
        <div className="flex align-center justify-between gap-x-2">
          <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
            Table: <span className="font-semibold">{playingTable!.name}</span>
          </div>
          <button
            className="!py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 w-[5rem]"
            onClick={() => copy("url")}
          >
            {textCopies.url}
          </button>
        </div>
        <p>
          <span>Created at:</span>
          <span className="ml-1 font-semibold">
            {new Date(playingTable!.createdAt).toLocaleDateString()}
          </span>
        </p>
        <div className="flex align-center justify-between gap-x-2">
          <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
            <span>API Key:</span>
            <span className="ml-1 font-semibold">
              {apiKey.slice(0, 6)}...{apiKey.slice(-6)}
            </span>
          </div>
          <button
            className="!py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 w-[5rem]"
            onClick={() => copy("key")}
          >
            {textCopies.key}
          </button>
        </div>
        <div className="flex justify-center mt-4 pt-4 border-t border-t-gray-300">
          <button
            type="button"
            className="border border-gray-300 hover:bg-gray-300"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableInfo;

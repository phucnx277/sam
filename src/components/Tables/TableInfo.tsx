import { useCallback, useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { ActionDef, isGameInProgress } from "@logic/game";

const TableInfo = ({ onClose }: { onClose: () => void }) => {
  const { playingTable, getApiKey, updateTable, isUpdatingTable } =
    useAppData();
  const { localPlayer } = useLocalPlayer();
  const apiKey = getApiKey("original");

  const isReadOnly =
    playingTable!.hostId !== localPlayer!.id ||
    isGameInProgress(playingTable!.game);

  const [textCopies, setTextCopies] = useState({
    url: "Copy link",
    key: "Copy",
    result: "Tổng kết",
  });
  const [hostId, setHostId] = useState<string>(playingTable!.hostId);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [inGamePlayers, setInGamePlayers] = useState<TablePlayer[]>([]);
  const [removedPlayers, setRemovedPlayers] = useState<TablePlayer[]>([]);

  useEffect(() => {
    if (!playingTable) return;
    setHostId(playingTable.hostId);
    const ingame = playingTable.players.filter((item) => !item.isRemoved);
    const removed = playingTable.players.filter((item) => item.isRemoved);
    setInGamePlayers(ingame);
    setRemovedPlayers(removed);
  }, [playingTable]);

  const copy = useCallback(
    (type: "url" | "key" | "result") => {
      const encodedApiKey = getApiKey("encoded");
      let content = encodedApiKey;
      let textCopy = "Copied!";
      if (!navigator.clipboard) {
        return;
      }
      if (type === "url") {
        content = `${window.location.origin}?apiKey=${encodedApiKey}&tblId=${playingTable!.id}&tblPw=${playingTable!.password}`;
        textCopy = "Link copied!";
      }

      if (type === "result") {
        content = playingTable!.players
          .map((item) => `${item.name}: ${item.chipCount}`)
          .join("\n");
        textCopy = "Copied!";
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

  const movePlayer = (player: TablePlayer) => {
    if (player.isRemoved) return;
    setIsDirty(true);
    const isInGame = inGamePlayers.some((item) => item.id === player.id);
    if (isInGame) {
      setInGamePlayers((prev) => prev.filter((item) => item.id !== player.id));
      setRemovedPlayers((prev) => [player, ...prev]);
    } else {
      setRemovedPlayers((prev) => prev.filter((item) => item.id !== player.id));
      setInGamePlayers((prev) => [player, ...prev]);
    }
  };

  const saveTable = async () => {
    if (isReadOnly || isUpdatingTable) return;
    if (inGamePlayers.length === 0) {
      return alert("Không thể xóa hết người chơi");
    }
    if (removedPlayers.some((item) => item.id === hostId)) {
      return alert("Không thể xóa chủ bàn");
    }

    const currentGamePlayer = playingTable!.game.players.find(
      (item) => item.id === localPlayer!.id,
    )!;

    let newTable = playingTable!;
    let shouldUpdate = false;

    if (playingTable!.hostId !== hostId) {
      newTable = ActionDef.transferHost.handleAction(
        newTable,
        currentGamePlayer,
        { newHostId: hostId },
      );
      shouldUpdate = true;
    }

    if (isDirty) {
      newTable = ActionDef.removePlayers.handleAction(
        newTable,
        currentGamePlayer,
        { deletingPlayerIds: removedPlayers.map((item) => item.id) },
      );
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const error = await updateTable(newTable);
      if (error) {
        alert(error.message);
      }
      setIsDirty(false);
      onClose();
    }
  };

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[25rem] max-w-[92%] gap-y-1">
        <div className="flex align-center justify-between gap-x-2">
          <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
            Tên bàn: <span className="font-semibold">{playingTable!.name}</span>
          </div>
          <button
            className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={() => copy("url")}
          >
            {textCopies.url}
          </button>
        </div>
        <div>
          <span>Chủ bàn:</span>
          {isReadOnly && (
            <span className="ml-1 font-semibold">
              {
                playingTable!.game.players.find((item) => item.id === hostId)
                  ?.name
              }
            </span>
          )}
          {!isReadOnly && (
            <select
              className="ml-1 border border-gray-600 rounded-sm min-w-[6rem] p-0.5"
              value={hostId}
              name="hostId"
              onChange={(v) => setHostId(v.target.value)}
            >
              {playingTable!.game.players.map((gp) => (
                <option value={gp.id} key={gp.id}>
                  {gp.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <p>Đang chơi:</p>
          <div className="mt-2 flex gap-1 flex-wrap min-h-[2rem]">
            {inGamePlayers.map((item) => (
              <TablePlayerInfo
                data={item}
                key={item.id}
                onMove={movePlayer}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
          <p className="mt-2">Đã chơi:</p>
          <div className="mt-2 flex gap-1 flex-wrap min-h-[2rem]">
            {removedPlayers.map((item) => (
              <TablePlayerInfo
                data={item}
                key={item.id}
                onMove={movePlayer}
                isReadOnly={isReadOnly || !!item.isRemoved}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <button
              className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
              onClick={() => copy("result")}
            >
              {textCopies.result}
            </button>
          </div>
        </div>

        <div className="flex align-center justify-between gap-x-2 mt-2 py-2 border-y border-y-gray-300">
          <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
            <span>API Key:</span>
            <span className="ml-1 font-semibold">
              {apiKey.slice(0, 6)}...{apiKey.slice(-6)}
            </span>
          </div>
          <button
            className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={() => copy("key")}
          >
            {textCopies.key}
          </button>
        </div>
        <div className="flex justify-center mt-4">
          <button
            type="button"
            className="!px-0 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 w-[8rem]"
            onClick={onClose}
          >
            Đóng
          </button>
          {!isReadOnly && (
            <button
              type="button"
              className="ml-4 !px-0 border border-green-600 bg-green-600 w-[8rem]"
              onClick={saveTable}
              disabled={isUpdatingTable}
            >
              Cập nhật
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const TablePlayerInfo = ({
  data,
  isReadOnly,
  onMove,
}: {
  data: TablePlayer;
  isReadOnly: boolean;
  onMove: (tbp: TablePlayer) => void;
}) => {
  return (
    <div
      onClick={() => (!isReadOnly ? onMove(data) : void 0)}
      className={`px-1.5 py-0.5 flex items-center justify-center gap-1 rounded-sm border min-w-[4rem] max-w-[6rem] ${!data.isRemoved ? "border-green-500 active:bg-green-500 hover:bg-green-500" : "bg-gray-300"} ${!isReadOnly ? "cursor-pointer" : ""}`}
    >
      <span className="max-w-[3rem] text-ellipsis overflow-hidden whitespace-nowrap">
        {data.name}
      </span>
      <span
        className={`text-sm px-0.5 border rounded-sm ${!data.isRemoved ? (data.chipCount >= 0 ? "border-green-500 text-green-500 bg-green-50" : "border-red-500 text-red-500 bg-red-50") : ""}`}
      >
        {data.chipCount}
      </span>
    </div>
  );
};

export default TableInfo;

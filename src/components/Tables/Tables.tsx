import { useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { TABLE_LIMIT } from "@logic/table";
import NewTable from "./NewTable";
import LobbyTable from "./LobbyTable";
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";

const Tables = () => {
  const { isInitialized, tables, playingTable, removeTable } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);

  const confirmRemoveTable = async (e: React.MouseEvent, table: Table) => {
    e.preventDefault();
    e.stopPropagation();

    const shouldDelete = window.confirm("Xóa nhé?");
    if (shouldDelete) {
      const err = await removeTable(table.id);
      if (err) {
        alert(err.message);
      }
    }
  };

  useEffect(() => {
    if (!tables?.length) return;
    const queryObj = new URLSearchParams(window.location.search);
    const tableId = queryObj.get("tblId");
    if (!tableId) return;

    const table = tables.find((item) => item.id === tableId);
    if (!table) return;

    setEnteringTable(table);
  }, [tables]);

  return (
    <>
      {!playingTable && (
        <>
          {isInitialized && !!localPlayer && (
            <div className="p-4">
              <p className="text-xl mb-4 text-center">
                Welcome,{" "}
                <span className="font-semibold">{localPlayer.name}</span>!
              </p>
              {tables.length > 0 && <p>Select a table</p>}
              <div className="flex flex-wrap gap-2 mt-4 items-center">
                {tables.map((item) => (
                  <div
                    className="!p-0 h-[8rem] w-[8rem] cursor-pointer relative"
                    key={item.id}
                    onClick={() => setEnteringTable(item)}
                  >
                    {(localPlayer.isAdmin ||
                      item.hostId === localPlayer.id) && (
                      <span
                        className="absolute right-2 top-0.5 font-normal text-gray-500 hover:text-gray-800"
                        onClick={(e) => confirmRemoveTable(e, item)}
                      >
                        {"🗙"}
                      </span>
                    )}
                    <LobbyTable data={item} />
                  </div>
                ))}
                {tables.length < TABLE_LIMIT && (
                  <>
                    <button
                      className="!p-0 h-[8rem] w-[8rem] border border-green-600 hover:bg-green-600"
                      onClick={() => setIsCreatingTable(true)}
                    >
                      Create table
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {isCreatingTable && (
            <NewTable
              close={() => setIsCreatingTable(false)}
              limit={TABLE_LIMIT}
            />
          )}
          {!!enteringTable && (
            <EnterTable
              table={enteringTable}
              close={() => setEnteringTable(null)}
            />
          )}
        </>
      )}
      {!!playingTable && <PlayingTable />}
    </>
  );
};

export default Tables;

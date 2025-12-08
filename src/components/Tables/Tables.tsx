import { useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { TABLE_LIMIT } from "@logic/table";
import NewTable from "./NewTable";
import LobbyTable from "./LobbyTable";
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";
import VersionInfo from "../common/VersionInfo";
import WelcomePlayer from "../Credentials/WelcomePlayer";

const Tables = () => {
  const { tables, playingTable, removeTable } = useAppData();
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

  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert("Link is invalid");
        return;
      }
      enterTableWithLink(clipboardText, tables);
    } catch {
      /* empty */
    }
  };

  const enterTableWithLink = (link: string, tables: Table[]) => {
    if (!tables?.length || !link) return;

    const queryObj = new URL(link).searchParams;
    const tableId = queryObj.get("tblId");
    if (!tableId) return;

    const table = tables.find((item) => item.id === tableId);
    if (!table) return;

    setEnteringTable(table);
  };

  useEffect(() => {
    enterTableWithLink(window.location.href, tables);
  }, [tables]);

  useEffect(() => {
    let tableId = playingTable?.id || null;
    if (
      tableId &&
      !playingTable!.game.players.some((item) => item.id === localPlayer!.id)
    ) {
      tableId = null;
    }

    const url = new URL(window.location.href);
    const tblIdFromUrl = url.searchParams.get("tblId");
    const tblPwFromUrl = url.searchParams.get("tblPw");

    if (!tableId) {
      url.searchParams.delete("tblId");
      // player gets removed
      if (playingTable) {
        url.searchParams.delete("tblPw");
        window.location.href = url.toString();
      } else {
        window.history.replaceState({}, "", url.toString());
      }
      return;
    }

    if (tableId && tblIdFromUrl !== tableId) {
      url.searchParams.set("tblId", tableId);
      url.searchParams.delete("tblPw");
      window.history.replaceState({}, "", url.toString());
      return;
    }

    if (tblPwFromUrl !== null) {
      url.searchParams.delete("tblPw");
      window.history.replaceState({}, "", url.toString());
      return;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable]);

  return (
    <>
      {!playingTable && (
        <>
          <div className="p-4 max-w-full">
            <WelcomePlayer />
            {tables.length > 0 && <p>Select a table</p>}
            <div className="flex flex-wrap gap-2 mt-4 items-center">
              {tables.map((item) => (
                <div
                  className="!p-0 h-[6rem] w-[6rem] lg:h-[8rem] lg:w-[8rem] cursor-pointer relative"
                  key={item.id}
                  onClick={() => setEnteringTable(item)}
                >
                  {(localPlayer!.isAdmin ||
                    item.hostId === localPlayer!.id) && (
                    <span
                      className="absolute text-2xl right-2 top-0 font-normal text-gray-500 hover:text-gray-800 active:text-gray-800 focus:text-gray-800"
                      onClick={(e) => confirmRemoveTable(e, item)}
                    >
                      {"×"}
                    </span>
                  )}
                  <LobbyTable data={item} />
                </div>
              ))}
              {tables.length < TABLE_LIMIT && (
                <>
                  <button
                    className="!py-0 !px-1  h-[6rem] w-[6rem] lg:h-[8rem] lg:w-[8rem] border border-green-600 hover:bg-green-600 active:bg-green-600 focus:bg-green-600"
                    onClick={() => setIsCreatingTable(true)}
                  >
                    Create table
                  </button>
                </>
              )}
            </div>
            <p className="mt-4">Or paste your link here</p>
            <button
              type="button"
              className="!p-2 mt-1 w-full max-w-[25rem] text-ellipsis overflow-hidden whitespace-nowrap border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 text-gray-500 hover:text-gray-800 text-sm text-left"
              onClick={handlePasteLink}
            >{`${window.location.origin}?apiKey=xxx&tblId=xxx`}</button>
          </div>
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
          <div className="fixed top-2 right-2">
            <VersionInfo />
          </div>
        </>
      )}
      {!!playingTable && <PlayingTable />}
    </>
  );
};

export default Tables;

import { useEffect, useState, lazy, Suspense } from "react";
import useAppData, { getTables } from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { TABLE_LIMIT } from "@logic/table";
import { decodeApiKey, isAblyApiKeyValid } from "@logic/util";
import NewTable from "./NewTable";
import LobbyTable from "./LobbyTable";
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";
import TopRightBar from "../common/TopRightBar";
import WelcomePlayer from "../Credentials/WelcomePlayer";

const ScanTable = lazy(() => import("./ScanTable"));

const Tables = () => {
  const { t } = useI18n();
  const { tables, playingTable, removeTable, init, getApiKey } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);

  const confirmRemoveTable = async (e: React.MouseEvent, table: Table) => {
    e.preventDefault();
    e.stopPropagation();

    const shouldDelete = window.confirm(t("confirm.deleteTable"));
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
        alert(t("table.linkInvalid"));
        return;
      }
      if (!enterTableWithLink(clipboardText, tables)) {
        alert(t("table.linkInvalid"));
      }
    } catch {
      /* empty */
    }
  };

  const enterTableWithLink = (link: string, tables: Table[]): boolean => {
    if (!tables?.length || !link) return false;

    const queryObj = new URL(link).searchParams;
    const tableId = queryObj.get("tblId");
    if (!tableId) return false;

    const table = tables.find((item) => item.id === tableId);
    if (!table) return false;

    setEnteringTable(table);
    return true;
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);

    let scannedUrl: URL;
    try {
      scannedUrl = new URL(payload);
    } catch {
      alert(t("table.linkInvalid"));
      return;
    }

    const tableId = scannedUrl.searchParams.get("tblId");
    if (!tableId) {
      alert(t("table.linkInvalid"));
      return;
    }

    const scannedKey = scannedUrl.searchParams.get("apiKey");
    if (!scannedKey) {
      alert(t("table.linkInvalid"));
      return;
    }

    const isSameKey = scannedKey === getApiKey("encoded");

    if (!isSameKey) {
      let isValidScannedKey = false;
      try {
        isValidScannedKey = isAblyApiKeyValid(decodeApiKey(scannedKey));
      } catch {
        isValidScannedKey = false;
      }
      if (!isValidScannedKey) {
        alert(t("table.linkInvalid"));
        return;
      }

      const { error } = await init(scannedKey);
      if (error) {
        alert(error.message);
        return;
      }
    }

    const scannedPassword = scannedUrl.searchParams.get("tblPw");
    const currentUrl = new URL(window.location.href);
    if (scannedPassword !== null) {
      currentUrl.searchParams.set("tblPw", scannedPassword);
    } else {
      currentUrl.searchParams.delete("tblPw");
    }
    window.history.replaceState({}, "", currentUrl.toString());

    if (!enterTableWithLink(payload, getTables())) {
      alert(t("table.linkInvalid"));
    }
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
          <div className="p-2 max-w-full min-w-[25rem]">
            <WelcomePlayer />
            {tables.length > 0 && (
              <div className="mt-8 flex items-baseline justify-between">
                <span>{t("lobby.selectTable")}</span>
                {tables.length < TABLE_LIMIT && (
                  <button
                    type="button"
                    className="!py-1 !px-4 border border-green-600 hover:bg-green-600 active:bg-green-600 focus:bg-green-600"
                    onClick={() => setIsCreatingTable(true)}
                  >
                    {t("lobby.createTable")}
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2 items-center">
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
            </div>
            <div className="mt-8 flex items-baseline justify-between">
              <span>{t("lobby.pasteLink")}</span>
              <button
                type="button"
                className="!py-1 !px-4 border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
                onClick={() => setIsScanning(true)}
              >
                {t("lobby.scan")}
              </button>
            </div>
            <button
              type="button"
              className="!p-2 mt-1 w-full text-ellipsis overflow-hidden whitespace-nowrap border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 text-gray-500 hover:text-gray-800 text-sm text-left"
              onClick={handlePasteLink}
            >{`${window.location.origin}?apiKey=xxx&tblId=xxx`}</button>
          </div>
          {isCreatingTable && (
            <NewTable
              close={() => setIsCreatingTable(false)}
              limit={TABLE_LIMIT}
            />
          )}
          {isScanning && (
            <Suspense fallback={null}>
              <ScanTable
                onScan={handleScan}
                onClose={() => setIsScanning(false)}
              />
            </Suspense>
          )}
          {!!enteringTable && (
            <EnterTable
              table={enteringTable}
              close={() => setEnteringTable(null)}
            />
          )}
          <TopRightBar />
        </>
      )}
      {!!playingTable && <PlayingTable />}
    </>
  );
};

export default Tables;

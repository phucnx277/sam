import { useEffect, useRef, useState, lazy, Suspense } from "react";
import useAppData, { getTables } from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { TABLE_LIMIT } from "@logic/table";
import { decodeApiKey, isAblyApiKeyValid, parseTableLink } from "@logic/util";
import NewTable from "./NewTable";
import LobbyTable from "./LobbyTable";
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";
import TopRightBar from "../common/TopRightBar";
import WelcomePlayer from "../Credentials/WelcomePlayer";

const ScanTable = lazy(() => import("./ScanTable"));

const Tables = () => {
  const { t } = useI18n();
  const {
    tables,
    playingTable,
    removeTable,
    init,
    initPeer,
    joinPeerTable,
    switchToAbly,
    mode,
    getApiKey,
  } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);
  const [enteringPeerTableId, setEnteringPeerTableId] = useState<string | null>(
    null,
  );
  const autoLinkedRef = useRef(false);

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

  const applyLink = async (link: string): Promise<boolean> => {
    const parsed = parseTableLink(link);
    if (!parsed) return false;

    if (parsed.mode === "peer") {
      if (mode !== "peer") {
        initPeer();
      }
      const localTable = getTables().find((item) => item.id === parsed.tableId);
      if (localTable) {
        setEnteringTable(localTable);
        return true;
      }
      if (parsed.password !== null) {
        joinPeerTable(parsed.tableId, parsed.password);
        return true;
      }
      setEnteringPeerTableId(parsed.tableId);
      return true;
    }

    const key = parsed.apiKey ?? "";
    const isSameKey = key === getApiKey("encoded");
    if (!isSameKey || mode !== "ably") {
      if (!isSameKey) {
        let isValidScannedKey = false;
        try {
          isValidScannedKey = isAblyApiKeyValid(decodeApiKey(key));
        } catch {
          isValidScannedKey = false;
        }
        if (!isValidScannedKey) return false;
      }

      const { error } = await init(key);
      if (error) {
        alert(error.message);
        return false;
      }
    }

    const currentUrl = new URL(window.location.href);
    if (parsed.password !== null) {
      currentUrl.searchParams.set("tblPw", parsed.password);
    } else {
      currentUrl.searchParams.delete("tblPw");
    }
    window.history.replaceState({}, "", currentUrl.toString());

    const table = getTables().find((item) => item.id === parsed.tableId);
    if (!table) return false;
    setEnteringTable(table);
    return true;
  };

  const handlePasteLink = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText?.startsWith(window.location.origin)) {
        alert(t("table.linkInvalid"));
        return;
      }
      if (!(await applyLink(clipboardText))) {
        alert(t("table.linkInvalid"));
      }
    } catch {
      /* empty */
    }
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);
    if (!(await applyLink(payload))) {
      alert(t("table.linkInvalid"));
    }
  };

  // Peer links: rejoin once, even before any local tables exist.
  // InitAppData strips `mode` from the URL before this mounts, so read
  // tblId/tblPw directly instead of requiring `mode=peer`.
  useEffect(() => {
    if (mode !== "peer" || autoLinkedRef.current) return;
    autoLinkedRef.current = true;
    const url = new URL(window.location.href);
    const tableId = url.searchParams.get("tblId");
    if (!tableId) return;
    const localTable = getTables().find((item) => item.id === tableId);
    if (localTable) {
      setEnteringTable(localTable);
      return;
    }
    const password = url.searchParams.get("tblPw");
    if (password !== null) {
      joinPeerTable(tableId, password);
      return;
    }
    setEnteringPeerTableId(tableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Ably deep links: resolve once the table list has loaded.
  useEffect(() => {
    if (mode === "peer") return;
    const parsed = parseTableLink(window.location.href);
    if (parsed?.mode !== "ably") return;
    const table = tables.find((item) => item.id === parsed.tableId);
    if (table) {
      setEnteringTable(table);
    }
  }, [tables, mode]);

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
      if (mode !== "peer") {
        url.searchParams.delete("tblPw");
      }
      window.history.replaceState({}, "", url.toString());
      return;
    }

    if (tblPwFromUrl !== null) {
      if (mode !== "peer") {
        url.searchParams.delete("tblPw");
      }
      window.history.replaceState({}, "", url.toString());
      return;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingTable]);

  return (
    <>
      {!playingTable && (
        <>
          <div className="p-2 max-w-full min-w-[22rem]">
            <WelcomePlayer />
            <div className="mt-6 flex items-baseline justify-between">
              <span>
                {t(tables.length > 0 ? "lobby.selectTable" : "lobby.noTable")}
              </span>
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
            <div className="mt-4 flex items-baseline justify-between">
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
            {mode === "peer" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  className="text-sm text-cyan-600 underline"
                  onClick={switchToAbly}
                >
                  {t("lobby.connectWithAbly")}
                </button>
              </div>
            )}
            {mode === "ably" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  className="text-sm text-cyan-600 underline"
                  onClick={initPeer}
                >
                  {t("lobby.switchToPeer")}
                </button>
              </div>
            )}
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
          {!!enteringPeerTableId && (
            <EnterTable
              tableId={enteringPeerTableId}
              close={() => setEnteringPeerTableId(null)}
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

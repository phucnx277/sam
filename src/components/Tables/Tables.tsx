import { useEffect, useRef, useState, lazy, Suspense } from "react";
import useAppData, { getTables } from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { TABLE_LIMIT, hostedTables, visibleTables } from "@logic/table";
import { decodeApiKey, isAblyApiKeyValid, parseTableLink } from "@logic/util";
import NewTable from "./NewTable";
import LobbyTable from "./LobbyTable";
import EnterTable from "./EnterTable";
import PlayingTable from "./PlayingTable";
import TopRightBar from "../common/TopRightBar";
import WelcomePlayer from "../Credentials/WelcomePlayer";
import ShareTable from "./ShareTable";
import LoadingOverlay from "../common/LoadingOverlay";

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
    peerError,
    getApiKey,
  } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const visible = mode === "peer" ? tables : visibleTables(tables, localPlayer);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enteringTable, setEnteringTable] = useState<Table | null>(null);
  const [enteringPeerTableId, setEnteringPeerTableId] = useState<string | null>(
    null,
  );
  const [isJoining, setIsJoining] = useState(false);
  const [sharingTable, setSharingTable] = useState<Table | null>(null);
  const [rejoinHandled, setRejoinHandled] = useState(false);

  // Capture the reload-rejoin intent at first render, before any effect can
  // strip `tblId` from the URL.
  const rejoinIntentRef = useRef<{
    tableId: string;
    password: string | null;
  } | null>(null);
  const rejoinInitRef = useRef(false);
  if (!rejoinInitRef.current) {
    rejoinInitRef.current = true;
    const url = new URL(window.location.href);
    const tableId = url.searchParams.get("tblId");
    if (tableId) {
      rejoinIntentRef.current = {
        tableId,
        password: url.searchParams.get("tblPw"),
      };
    }
  }

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
      setIsJoining(true);
      if (!(await applyLink(clipboardText))) {
        setIsJoining(false);
        alert(t("table.linkInvalid"));
      }
    } catch {
      setIsJoining(false);
      /* empty */
    }
  };

  const handleScan = async (payload: string) => {
    setIsScanning(false);
    setIsJoining(true);
    try {
      if (!(await applyLink(payload))) {
        setIsJoining(false);
        alert(t("table.linkInvalid"));
      }
    } catch {
      setIsJoining(false);
    }
  };

  // Reload rejoin / deep link: resume the table referenced by the URL once the
  // transport is ready and (for Ably) the table list has loaded.
  useEffect(() => {
    const intent = rejoinIntentRef.current;
    if (!intent || rejoinHandled || !localPlayer) return;

    if (mode === "peer") {
      const localTable = getTables().find((item) => item.id === intent.tableId);
      if (localTable) {
        setRejoinHandled(true);
        setEnteringTable(localTable);
        return;
      }
      setRejoinHandled(true);
      if (intent.password !== null) {
        setIsJoining(true);
        joinPeerTable(intent.tableId, intent.password);
        return;
      }
      setEnteringPeerTableId(intent.tableId);
      return;
    }

    if (mode !== "ably") return;
    const table = tables.find((item) => item.id === intent.tableId);
    if (!table) return;
    setRejoinHandled(true);
    setEnteringTable(table);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tables, localPlayer, rejoinHandled]);

  // If the table never shows up (e.g. it was deleted), stop holding the URL.
  useEffect(() => {
    if (!rejoinIntentRef.current) return;
    const timer = window.setTimeout(() => setRejoinHandled(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  // Clear the join overlay as soon as there is something else to show.
  useEffect(() => {
    if (
      isJoining &&
      (enteringTable || enteringPeerTableId || playingTable || peerError)
    ) {
      setIsJoining(false);
    }
  }, [isJoining, enteringTable, enteringPeerTableId, playingTable, peerError]);

  useEffect(() => {
    if (rejoinIntentRef.current && (!rejoinHandled || isJoining)) return;
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
      url.searchParams.delete("tblPw");
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
  }, [playingTable, rejoinHandled, isJoining]);

  return (
    <>
      {!playingTable && (
        <>
          <div className="p-2 max-w-full min-w-[22rem]">
            <WelcomePlayer />
            <div className="mt-6 flex items-baseline justify-between">
              <span>
                {t(visible.length > 0 ? "lobby.selectTable" : "lobby.noTable")}
              </span>
              {hostedTables(tables, localPlayer).length < TABLE_LIMIT && (
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
              {visible.map((item) => (
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
              onCreated={setSharingTable}
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
      {!!sharingTable && (
        <ShareTable
          table={sharingTable}
          onClose={() => setSharingTable(null)}
        />
      )}
      {isJoining && <LoadingOverlay />}
    </>
  );
};

export default Tables;

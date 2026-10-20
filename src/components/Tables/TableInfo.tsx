import { useCallback, useEffect, useState } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { ActionDef, isGameInProgress } from "@logic/game";

const TableInfo = ({ onClose }: { onClose: () => void }) => {
  const { t } = useI18n();
  const {
    playingTable,
    getApiKey,
    updateTable,
    isUpdatingTable,
    isPeerFallback,
    mode,
  } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const apiKey = getApiKey("original");

  const isReadOnly =
    playingTable!.hostId !== localPlayer!.id ||
    isGameInProgress(playingTable!.game);

  const [copied, setCopied] = useState({
    key: false,
    result: false,
  });
  const [hostId, setHostId] = useState<string>(playingTable!.hostId);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [inGamePlayers, setInGamePlayers] = useState<TablePlayer[]>([]);
  const [removedPlayers, setRemovedPlayers] = useState<TablePlayer[]>([]);
  const [smallBlindInput, setSmallBlindInput] = useState<string>(
    String(playingTable!.smallBlind ?? 5),
  );
  const [bigBlindInput, setBigBlindInput] = useState<string>(
    String(playingTable!.bigBlind ?? 10),
  );
  const [anteInput, setAnteInput] = useState<string>(
    String(playingTable!.ante ?? 0),
  );
  const [addChipPlayerId, setAddChipPlayerId] = useState<string>(
    playingTable!.game.players[0]?.id ?? "",
  );
  const [addChipAmount, setAddChipAmount] = useState<string>(
    String(playingTable!.buyIn ?? 1000),
  );

  useEffect(() => {
    if (!playingTable) return;
    setHostId(playingTable.hostId);
    const ingame = playingTable.players.filter((item) => !item.isRemoved);
    const removed = playingTable.players.filter((item) => item.isRemoved);
    setInGamePlayers(ingame);
    setRemovedPlayers(removed);
    setSmallBlindInput(String(playingTable.smallBlind ?? 5));
    setBigBlindInput(String(playingTable.bigBlind ?? 10));
    setAnteInput(String(playingTable.ante ?? 0));
    setAddChipPlayerId((prev) =>
      playingTable.game.players.some((gp) => gp.id === prev)
        ? prev
        : (playingTable.game.players[0]?.id ?? ""),
    );
  }, [playingTable]);

  const copy = useCallback(
    (type: "key" | "result") => {
      const encodedApiKey = getApiKey("encoded");
      let content = encodedApiKey;
      if (!navigator.clipboard) {
        return;
      }
      if (type === "result") {
        content = playingTable!.players
          .map((item) =>
            playingTable!.gameType === "poker"
              ? `${item.name}: ${item.stack ?? 0}`
              : `${item.name}: ${item.chipCount}`,
          )
          .join("\n");
      }
      navigator.clipboard
        .writeText(content)
        .then(() => {
          setCopied((prev) => ({ ...prev, [type]: true }));
          setTimeout(() => {
            setCopied((prev) => ({ ...prev, [type]: false }));
          }, 2000);
        })
        .catch((e) => {
          alert(e);
        });
    },
    [playingTable, getApiKey],
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

  const updateBlinds = async () => {
    if (isReadOnly || isUpdatingTable || playingTable!.gameType !== "poker")
      return;
    const currentGamePlayer = playingTable!.game.players.find(
      (item) => item.id === localPlayer!.id,
    )!;
    const nextTable = ActionDef.updatePokerConfig.handleAction(
      playingTable!,
      currentGamePlayer,
      {
        smallBlind: Number(smallBlindInput),
        bigBlind: Number(bigBlindInput),
        ante: Number(anteInput),
      },
    );
    const error = await updateTable(nextTable);
    if (error) {
      alert(error.message);
    }
  };

  const addChips = async () => {
    if (
      isReadOnly ||
      isUpdatingTable ||
      playingTable!.gameType !== "poker" ||
      playingTable!.pokerMode === "tournament"
    )
      return;
    const currentGamePlayer = playingTable!.game.players.find(
      (item) => item.id === localPlayer!.id,
    )!;
    const targetPlayerId =
      addChipPlayerId || playingTable!.game.players[0]?.id || "";
    const nextTable = ActionDef.addPokerChips.handleAction(
      playingTable!,
      currentGamePlayer,
      {
        targetPlayerId,
        amount: Number(addChipAmount),
      },
    );
    const error = await updateTable(nextTable);
    if (error) {
      alert(error.message);
    }
  };

  const saveTable = async () => {
    if (isReadOnly || isUpdatingTable) return;
    if (inGamePlayers.length === 0) {
      return alert(t("error.cannotRemoveAllPlayers"));
    }
    if (removedPlayers.some((item) => item.id === hostId)) {
      return alert(t("error.cannotRemoveHost"));
    }

    const currentGamePlayer = playingTable!.game.players.find(
      (item) => item.id === localPlayer!.id,
    )!;

    let newTable = playingTable!;
    let shouldUpdate = false;

    if (playingTable!.gameType === "poker") {
      const nextSb = Number(smallBlindInput);
      const nextBb = Number(bigBlindInput);
      const nextAnte = Number(anteInput);
      if (
        nextSb !== (playingTable!.smallBlind ?? 5) ||
        nextBb !== (playingTable!.bigBlind ?? 10) ||
        nextAnte !== (playingTable!.ante ?? 0)
      ) {
        newTable = ActionDef.updatePokerConfig.handleAction(
          newTable,
          currentGamePlayer,
          {
            smallBlind: nextSb,
            bigBlind: nextBb,
            ante: nextAnte,
          },
        );
        shouldUpdate = true;
      }
    }

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
      <div className="bg-white overflow-y-auto flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[30rem] max-w-[92%] max-h-[92%] gap-y-1">
        <div className="flex gap-x-2 items-center">
          <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
            {t("table.nameLabel")}
            <span className="font-semibold">{playingTable!.name}</span>
          </div>
          <div
            className={`px-2 py-0.5 text-xs rounded-sm ${isPeerFallback ? "bg-amber-200 text-amber-900" : "bg-green-200 text-green-900"}`}
          >
            {isPeerFallback ? t("game.fallbackMode") : t("game.directMode")}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <div>
            <span>{t("table.gameType")}:</span>
            <span className="ml-1 font-semibold">
              {playingTable!.gameType === "phom"
                ? t("table.gamePhom")
                : playingTable!.gameType === "poker"
                  ? `${t("table.gamePoker")} (${playingTable!.pokerMode === "tournament" ? t("table.pokerTournament") : t("table.pokerCash")})`
                  : t("table.gameSam")}
            </span>
          </div>
          {playingTable!.gameType === "phom" && (
            <div>
              <span>{t("game.multiplier")}</span>
              <span className="ml-1 font-semibold">
                {playingTable!.multiplier ?? 10}
              </span>
            </div>
          )}
          {playingTable!.gameType === "poker" && (
            <>
              <div>
                <span>{t("table.buyInLabel")}</span>
                <span className="ml-1 font-semibold">
                  {playingTable!.buyIn ?? 1000}
                </span>
              </div>
              <div>
                <span>{t("table.blindsLabel")}</span>
                <span className="ml-1 font-semibold">
                  {playingTable!.smallBlind ?? 5}/{playingTable!.bigBlind ?? 10}
                </span>
              </div>
              <div>
                <span>{t("table.anteLabel")}</span>
                <span className="ml-1 font-semibold">
                  {playingTable!.ante ?? 0}
                </span>
              </div>
            </>
          )}
        </div>
        <div>
          <span>{t("table.hostLabel")}</span>
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

        {!isReadOnly && playingTable!.gameType === "poker" && (
          <div className="my-1 p-2 border border-gray-200 rounded-sm flex flex-col gap-y-2 bg-gray-50">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">{t("table.blindsLabel")}</span>
              <input
                type="number"
                min={
                  playingTable!.pokerMode === "tournament"
                    ? (playingTable!.smallBlind ?? 5)
                    : 1
                }
                value={smallBlindInput}
                onChange={(e) => setSmallBlindInput(e.target.value)}
                className="w-16 px-1 py-0.5 border border-gray-400 rounded-sm bg-white"
              />
              <span>/</span>
              <input
                type="number"
                min={
                  playingTable!.pokerMode === "tournament"
                    ? (playingTable!.bigBlind ?? 10)
                    : 1
                }
                value={bigBlindInput}
                onChange={(e) => setBigBlindInput(e.target.value)}
                className="w-16 px-1 py-0.5 border border-gray-400 rounded-sm bg-white"
              />
              <span className="ml-1 font-medium">{t("table.anteLabel")}</span>
              <input
                type="number"
                min={
                  playingTable!.pokerMode === "tournament"
                    ? (playingTable!.ante ?? 0)
                    : 0
                }
                value={anteInput}
                onChange={(e) => setAnteInput(e.target.value)}
                className="w-16 px-1 py-0.5 border border-gray-400 rounded-sm bg-white"
              />
              <button
                type="button"
                className="!px-2 !py-0.5 text-xs border border-amber-500 bg-amber-200 hover:bg-amber-300 rounded-sm font-medium"
                onClick={updateBlinds}
                disabled={isUpdatingTable}
              >
                {t("table.updateBlindsBtn")}
              </button>
            </div>

            {playingTable!.pokerMode !== "tournament" && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{t("table.addChipsTitle")}</span>
                <select
                  className="border border-gray-400 rounded-sm px-1 py-0.5 bg-white"
                  value={addChipPlayerId}
                  onChange={(e) => setAddChipPlayerId(e.target.value)}
                >
                  {playingTable!.game.players.map((gp) => (
                    <option value={gp.id} key={gp.id}>
                      {gp.name} ({gp.stack ?? (playingTable!.buyIn ?? 1000)})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  placeholder={t("table.addChipsAmountPlaceholder")}
                  value={addChipAmount}
                  onChange={(e) => setAddChipAmount(e.target.value)}
                  className="w-20 px-1 py-0.5 border border-gray-400 rounded-sm bg-white"
                />
                <button
                  type="button"
                  className="!px-2 !py-0.5 text-xs border border-emerald-600 bg-emerald-200 hover:bg-emerald-300 rounded-sm font-medium"
                  onClick={addChips}
                  disabled={isUpdatingTable}
                >
                  {t("table.addChipsBtn")}
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <p>{t("table.activePlayers")}</p>
          <div className="mt-2 flex gap-1 flex-wrap min-h-[2rem]">
            {inGamePlayers.map((item) => (
              <TablePlayerInfo
                data={item}
                key={item.id}
                onMove={movePlayer}
                isReadOnly={isReadOnly}
                isPoker={playingTable!.gameType === "poker"}
              />
            ))}
          </div>
          {removedPlayers.length > 0 && (
            <>
              <p className="mt-2">{t("table.removedPlayers")}</p>
              <div className="mt-2 flex gap-1 flex-wrap min-h-[2rem]">
                {removedPlayers.map((item) => (
                  <TablePlayerInfo
                    data={item}
                    key={item.id}
                    onMove={movePlayer}
                    isReadOnly={isReadOnly || !!item.isRemoved}
                    isPoker={playingTable!.gameType === "poker"}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <button
              className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
              onClick={() => copy("result")}
            >
              {copied.result ? t("common.copied") : t("table.summary")}
            </button>
          </div>
        </div>

        {mode !== "peer" && (
          <div className="flex align-center justify-between gap-x-2 mt-2 py-2 border-y border-y-gray-300">
            <div className="flex-1 text-ellipsis overflow-hidden whitespace-nowrap">
              <span>{t("table.apiKeyLabel")}</span>
              <span className="ml-1 font-semibold">
                {apiKey.slice(0, 6)}...{apiKey.slice(-6)}
              </span>
            </div>
            <button
              className="w-[5rem] !py-1 !px-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
              onClick={() => copy("key")}
            >
              {copied.key ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        )}
        <div className="flex justify-center mt-4">
          <button
            type="button"
            className="!px-0 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 w-[8rem]"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
          {!isReadOnly && (
            <button
              type="button"
              className="ml-4 !px-0 border border-green-600 bg-green-600 w-[8rem]"
              onClick={saveTable}
              disabled={isUpdatingTable}
            >
              {t("common.update")}
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
  isPoker,
  onMove,
}: {
  data: TablePlayer;
  isReadOnly: boolean;
  isPoker?: boolean;
  onMove: (tbp: TablePlayer) => void;
}) => {
  return (
    <div
      onClick={() => (!isReadOnly ? onMove(data) : void 0)}
      className={`px-1.5 py-0.5 flex items-center justify-center gap-1 rounded-sm border min-w-[4rem] ${isPoker ? "max-w-[10rem]" : "max-w-[6rem]"} ${!data.isRemoved ? "border-green-500 active:bg-green-500 hover:bg-green-500" : "bg-gray-300"} ${!isReadOnly ? "cursor-pointer" : ""}`}
    >
      <span className="max-w-[3.5rem] text-ellipsis overflow-hidden whitespace-nowrap">
        {data.name}
      </span>
      {isPoker ? (
        <span className="text-sm px-0.5 border border-amber-500 text-amber-800 bg-amber-50 rounded-sm">
          {data.stack ?? 0}
        </span>
      ) : (
        <span
          className={`text-sm px-0.5 border rounded-sm ${!data.isRemoved ? (data.chipCount >= 0 ? "border-green-500 text-green-500 bg-green-50" : "border-red-500 text-red-500 bg-red-50") : ""}`}
        >
          {data.chipCount}
        </span>
      )}
    </div>
  );
};

export default TableInfo;

import { useEffect, useState, type FormEvent } from "react";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useAppData from "@hooks/useAppData";

const EnterTable = (props: { table: Table; close: () => void }) => {
  const [password, setPassword] = useState("");
  const { localPlayer } = useLocalPlayer();
  const { enterTable } = useAppData();

  useEffect(() => {
    if (!localPlayer) return;
    if (localPlayer.id === props.table.hostId) {
      (async () => {
        const error = await enterTable({
          table: props.table,
          player: localPlayer,
          password: "",
        });
        if (error) {
          alert(error.message);
          return;
        }
      })();
    }
  }, [localPlayer, props.table, enterTable]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || !localPlayer) return;
    const error = await enterTable({
      table: props.table,
      player: localPlayer,
      password,
    });
    if (error) {
      alert(error.message);
      setPassword("");
      return;
    }
    props.close();
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="w-full flex justify-center">
        <form className="bg-white p-8 rounded-lg" onSubmit={submit}>
          <div className="text-xl">
            <span>Entering table: </span>
            <span className="font-semibold">{props.table.name}</span>
          </div>
          <input
            name="tblPassword"
            className="mt-4 py-1 px-2 border border-gray-500 rounded-sm text-lg w-[250px] max-w-full"
            autoFocus
            placeholder="Enter table password"
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              className="flex-1 border border-gray-300 hover:bg-gray-300"
              onClick={props.close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ml-4 flex-1 border border-green-600 bg-green-600"
              disabled={!password}
            >
              Enter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EnterTable;

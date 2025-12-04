import { useEffect, useState, type FormEvent } from "react";
import useLocalPlayer from "@hooks/useLocalPlayer";
import useAppData from "@hooks/useAppData";

const EnterTable = (props: { table: Table; close: () => void }) => {
  const [password, setPassword] = useState("");
  const { localPlayer } = useLocalPlayer();
  const { enterTable } = useAppData();

  useEffect(() => {
    if (!localPlayer) return;
    const url = new URL(window.location.href);
    let password = url.searchParams.get("tblPw") || "";
    const alreadyJoined = props.table.game?.players?.some(
      (gp) => gp.id === localPlayer.id,
    );
    if (alreadyJoined) {
      password = props.table.password;
    }
    if (alreadyJoined || password || !props.table.password) {
      (async () => {
        const error = await enterTable({
          table: props.table,
          player: localPlayer,
          password,
        });
        if (error) {
          alert(error.message);
        }
        props.close();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.table]);

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
    }
    props.close();
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <form
        className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[20rem] max-w-[92%] gap-y-2"
        onSubmit={submit}
        autoComplete="off"
      >
        <div className="text-lg text-center">
          <span>Table: </span>
          <span className="font-semibold">{props.table.name}</span>
        </div>
        <input
          name="tblPassword"
          className="mt-2 py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
          autoFocus
          placeholder="Enter password"
          type="password"
          value={password}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        <div className="mt-2 flex justify-between">
          <button
            type="button"
            className="flex-1 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
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
  );
};

export default EnterTable;

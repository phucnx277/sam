import { useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";

const NewTable = (props: { close: () => void; limit: number }) => {
  const { localPlayer } = useLocalPlayer();
  const { createTable, tables } = useAppData();
  const [form, setForm] = useState<Partial<Table>>({
    name: "",
    password: "",
    bo: -1,
    playerLimit: 5,
  });

  const updateFormValue = (key: keyof Table, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.password || !form.bo || !form.playerLimit) return;
    if (tables.length >= props.limit) {
      alert(`Max number of tables is ${props.limit}`);
      return;
    }
    const { error } = await createTable({
      name: form.name,
      password: form.password,
      player: localPlayer!,
      bo: form.bo || -1,
      playerLimit: form.playerLimit || 5,
    });
    if (error) {
      alert(error.message);
      return;
    }
    props.close();
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="w-full flex justify-center">
        <form
          className="bg-white p-8 rounded-lg shadow-2xl shadow-gray-400"
          onSubmit={submit}
        >
          <div>
            <input
              name="tblName"
              className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-[16rem] max-w-full"
              autoFocus
              placeholder="Table name"
              type="text"
              value={form.name}
              onInput={(e) => updateFormValue("name", e.currentTarget.value)}
            />
          </div>
          <div>
            <input
              name="tblPassword"
              className="mt-4 py-1 px-2 border border-gray-500 rounded-sm text-lg w-[16rem] max-w-full"
              placeholder="Password"
              type="password"
              value={form.password}
              onInput={(e) =>
                updateFormValue("password", e.currentTarget.value)
              }
            />
          </div>
          <div>
            <input
              name="tblBo"
              className="mt-4 py-1 px-2 border border-gray-500 rounded-sm text-lg w-[16rem] max-w-full"
              placeholder="Best Of X. -1 if no limit"
              type="number"
              min={-1}
              value={form.bo}
              onInput={(e) => updateFormValue("bo", e.currentTarget.value)}
            />
          </div>
          <div>
            <input
              name="tblLimitPlayer"
              className="mt-4 py-1 px-2 border border-gray-500 rounded-sm text-lg w-[16rem] max-w-full"
              placeholder="Max number of players (2-5)"
              type="number"
              min={2}
              max={5}
              value={form.playerLimit}
              onInput={(e) =>
                updateFormValue("playerLimit", e.currentTarget.value)
              }
            />
          </div>
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
              className="flex-1 ml-4  border border-green-600 bg-green-600"
              disabled={
                !form.name || !form.password || !form.bo || !form.playerLimit
              }
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewTable;

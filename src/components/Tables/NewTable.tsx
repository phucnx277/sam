import { useCallback, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";

function isNameValid(value?: string): boolean {
  return !!value && value.length <= 20;
}

function isBoValid(value: number): boolean {
  return !isNaN(value) && value >= -1 && Math.abs(value % 2) === 1;
}

function isPlayerLimitValid(value: number): boolean {
  return !isNaN(value) && value >= 2 && value <= 5;
}

function isTurnTimeoutValid(value: number): boolean {
  return !isNaN(value) && value >= 0 && value <= 90;
}

const NewTable = (props: { close: () => void; limit: number }) => {
  const { localPlayer } = useLocalPlayer();
  const { createTable, tables } = useAppData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<Table>>({
    name: "",
    password: "",
    bo: -1, // normal mode
    playerLimit: 5,
    turnTimeout: 20, // 20 seconds
  });

  const updateFormValue = (key: keyof Table, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isFormValid = useCallback(() => {
    return (
      isNameValid(form.name) &&
      isBoValid(Number(form.bo)) &&
      isPlayerLimitValid(Number(form.playerLimit)) &&
      isTurnTimeoutValid(Number(form.turnTimeout))
    );
  }, [form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !isFormValid()) return;
    if (tables.length >= props.limit) {
      alert(`Max number of tables is ${props.limit}`);
      return;
    }
    setIsSubmitting(true);
    const { error } = await createTable({
      name: form.name!,
      password: form.password || "",
      player: localPlayer!,
      bo: Number(form.bo),
      playerLimit: Number(form.playerLimit),
      turnTimeout: Number(form.turnTimeout),
    });
    setIsSubmitting(false);
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
          className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[20rem] max-w-[92%] gap-y-2"
          onSubmit={submit}
          autoComplete="off"
        >
          <p className="text-center text-lg">New Table</p>
          <input
            name="tblName"
            className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
            autoFocus
            placeholder="Name"
            type="text"
            value={form.name}
            onInput={(e) => updateFormValue("name", e.currentTarget.value)}
          />
          <input
            name="tblPassword"
            className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
            placeholder="Password"
            type="password"
            value={form.password}
            onInput={(e) => updateFormValue("password", e.currentTarget.value)}
          />
          <input
            name="tblBo"
            className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
            placeholder="Best Of X. -1 == No Limit"
            type="number"
            min={-1}
            value={form.bo}
            onInput={(e) => updateFormValue("bo", e.currentTarget.value)}
          />
          <input
            name="tblLimitPlayer"
            className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
            placeholder="Max number of players (2-5)"
            type="number"
            min={2}
            max={5}
            value={form.playerLimit}
            onInput={(e) =>
              updateFormValue("playerLimit", e.currentTarget.value)
            }
          />
          <input
            name="tblPlayerTurnTimeout"
            className="py-1 px-2 border border-gray-500 rounded-sm text-lg w-full"
            placeholder="Turn timeout (sec). 0 == Disabled"
            type="number"
            min={0}
            max={90}
            value={form.turnTimeout}
            onInput={(e) =>
              updateFormValue("turnTimeout", e.currentTarget.value)
            }
          />
          <div className="mt-2 flex justify-between">
            <button
              type="button"
              className="flex-1 border border-gray-300 hover:bg-gray-300"
              onClick={props.close}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 ml-4  border border-green-600 bg-green-600"
              disabled={!isFormValid()}
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

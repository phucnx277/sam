import { useCallback, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import type { NewTableParams } from "@logic/table";

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

const normalizedFormValues = (
  formData: Partial<NewTableParams>,
): Partial<NewTableParams> => {
  formData.bo = Number(formData.bo || -1);
  formData.playerLimit = Number(formData.playerLimit || 5);
  formData.turnTimeout = Number(formData.turnTimeout || 20);

  return formData;
};

const NewTable = (props: { close: () => void; limit: number }) => {
  const { localPlayer } = useLocalPlayer();
  const { createTable, tables } = useAppData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<NewTableParams>>({
    name: "",
    password: "",
    bo: "",
    playerLimit: "",
    turnTimeout: "",
  } as never);

  const updateFormValue = (key: keyof Table, value: string) => {
    setForm((prev) => ({ ...prev, [key]: String(value) }));
  };

  const isFormValid = useCallback(() => {
    const checkingForm = normalizedFormValues({ ...form });
    return (
      isNameValid(checkingForm.name) &&
      isBoValid(checkingForm.bo!) &&
      isPlayerLimitValid(checkingForm.playerLimit!) &&
      isTurnTimeoutValid(checkingForm.turnTimeout!)
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
    const payload: NewTableParams = {
      ...form,
      ...normalizedFormValues({ ...form }),
      player: localPlayer!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const { error } = await createTable(payload);
    setIsSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    props.close();
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <form
        className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[22rem] max-w-[92%] gap-y-2"
        onSubmit={submit}
        autoComplete="off"
      >
        <p className="text-center text-lg">New Table</p>
        <input
          name="tblName"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          autoFocus
          placeholder="Name(*)"
          type="text"
          value={form.name}
          onInput={(e) => updateFormValue("name", e.currentTarget.value)}
        />
        <input
          name="tblPassword"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder="Password"
          type="password"
          value={form.password}
          onInput={(e) => updateFormValue("password", e.currentTarget.value)}
        />
        <input
          name="tblBo"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder="Best Of X. Default = No Limit"
          type="number"
          min={-1}
          value={form.bo}
          onInput={(e) => updateFormValue("bo", e.currentTarget.value)}
        />
        <input
          name="tblLimitPlayer"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder="Player limit. Default = 5"
          type="number"
          min={2}
          max={5}
          value={form.playerLimit}
          onInput={(e) => updateFormValue("playerLimit", e.currentTarget.value)}
        />
        <input
          name="tblPlayerTurnTimeout"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder="Turn timeout. Default = 20s. 0 = Disabled"
          type="number"
          min={0}
          max={90}
          value={form.turnTimeout}
          onInput={(e) => updateFormValue("turnTimeout", e.currentTarget.value)}
        />
        <div className="mt-2 flex justify-between">
          <button
            type="button"
            className="flex-1 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
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
  );
};

export default NewTable;

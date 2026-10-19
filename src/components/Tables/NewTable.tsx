import { useCallback, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { hostedTables, type NewTableParams } from "@logic/table";

function isNameValid(value?: string): boolean {
  return !!value && value.length <= 20;
}

function isBoValid(value: number): boolean {
  return !isNaN(value) && value >= -1 && Math.abs(value % 2) === 1;
}

function isMultiplierValid(value: number): boolean {
  return !isNaN(value) && value >= 1 && Number.isInteger(value);
}

function isPlayerLimitValid(value: number, gameType: GameType): boolean {
  const max = gameType === "phom" ? 4 : 5;
  return !isNaN(value) && value >= 2 && value <= max;
}

function isTurnTimeoutValid(value: number): boolean {
  return !isNaN(value) && value >= 0 && value <= 90;
}

const normalizedFormValues = (
  formData: Partial<NewTableParams>,
): Partial<NewTableParams> => {
  const gameType: GameType = formData.gameType === "phom" ? "phom" : "sam";
  formData.gameType = gameType;
  formData.bo = gameType === "phom" ? -1 : Number(formData.bo || -1);
  formData.multiplier = Number(formData.multiplier || 10);
  formData.playerLimit = Number(
    formData.playerLimit || (gameType === "phom" ? 4 : 5),
  );
  formData.turnTimeout = Number(formData.turnTimeout || 0);

  return formData;
};

const NewTable = (props: {
  close: () => void;
  limit: number;
  onCreated?: (table: Table) => void;
}) => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { createTable, tables } = useAppData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<NewTableParams>>({
    gameType: "sam",
    name: "",
    password: "",
    bo: "",
    multiplier: "",
    playerLimit: "",
    turnTimeout: "",
  } as never);

  const updateFormValue = (key: keyof Table, value: string) => {
    setForm((prev) => ({ ...prev, [key]: String(value) }));
  };

  const isFormValid = useCallback(() => {
    const checkingForm = normalizedFormValues({ ...form });
    const isSettingValid =
      checkingForm.gameType === "phom"
        ? isMultiplierValid(checkingForm.multiplier!)
        : isBoValid(checkingForm.bo!);
    return (
      isNameValid(checkingForm.name) &&
      isSettingValid &&
      isPlayerLimitValid(checkingForm.playerLimit!, checkingForm.gameType!) &&
      isTurnTimeoutValid(checkingForm.turnTimeout!)
    );
  }, [form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !isFormValid()) return;
    if (hostedTables(tables, localPlayer).length >= props.limit) {
      alert(t("error.tableLimit", { limit: props.limit }));
      return;
    }
    setIsSubmitting(true);
    const payload: NewTableParams = {
      ...form,
      ...normalizedFormValues({ ...form }),
      player: localPlayer!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const { error, table } = await createTable(payload);
    setIsSubmitting(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (table) {
      props.onCreated?.(table);
    }
    props.close();
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <form
        className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[30rem] max-w-[92%] gap-y-2"
        onSubmit={submit}
        autoComplete="off"
      >
        <p className="text-center text-lg">{t("table.newTitle")}</p>
        <div className="flex gap-x-2">
          <button
            type="button"
            className={`flex-1 py-1 border rounded-sm font-semibold ${
              (form.gameType || "sam") === "sam"
                ? "border-cyan-600 bg-cyan-300"
                : "border-gray-300 bg-white"
            }`}
            onClick={() => updateFormValue("gameType", "sam")}
          >
            {t("table.gameSam")}
          </button>
          <button
            type="button"
            className={`flex-1 py-1 border rounded-sm font-semibold ${
              form.gameType === "phom"
                ? "border-cyan-600 bg-cyan-300"
                : "border-gray-300 bg-white"
            }`}
            onClick={() => updateFormValue("gameType", "phom")}
          >
            {t("table.gamePhom")}
          </button>
        </div>
        <input
          name="tblName"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          autoFocus
          placeholder={t("table.namePlaceholder")}
          type="text"
          value={form.name}
          onInput={(e) => updateFormValue("name", e.currentTarget.value)}
        />
        <input
          name="tblPassword"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder={t("table.passwordPlaceholder")}
          type="password"
          value={form.password}
          onInput={(e) => updateFormValue("password", e.currentTarget.value)}
        />
        {form.gameType === "phom" ? (
          <input
            name="tblMultiplier"
            className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
            placeholder={t("table.multiplierPlaceholder")}
            type="number"
            min={1}
            value={form.multiplier}
            onInput={(e) => updateFormValue("multiplier", e.currentTarget.value)}
          />
        ) : (
          <input
            name="tblBo"
            className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
            placeholder={t("table.boPlaceholder")}
            type="number"
            min={-1}
            value={form.bo}
            onInput={(e) => updateFormValue("bo", e.currentTarget.value)}
          />
        )}
        <input
          name="tblLimitPlayer"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder={
            form.gameType === "phom"
              ? t("table.phomPlayerLimitPlaceholder")
              : t("table.playerLimitPlaceholder")
          }
          type="number"
          min={2}
          max={form.gameType === "phom" ? 4 : 5}
          value={form.playerLimit}
          onInput={(e) => updateFormValue("playerLimit", e.currentTarget.value)}
        />
        <input
          name="tblPlayerTurnTimeout"
          className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
          placeholder={t("table.turnTimeoutPlaceholder")}
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
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="flex-1 ml-4  border border-green-600 bg-green-600"
            disabled={!isFormValid()}
          >
            {t("common.submit")}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewTable;

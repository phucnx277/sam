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

function isBuyInValid(value: number): boolean {
  return !isNaN(value) && value >= 1 && Number.isInteger(value);
}

function isBlindsValid(sb: number, bb: number, ante: number): boolean {
  return (
    !isNaN(sb) &&
    !isNaN(bb) &&
    !isNaN(ante) &&
    sb >= 1 &&
    bb >= sb &&
    ante >= 0 &&
    Number.isInteger(sb) &&
    Number.isInteger(bb) &&
    Number.isInteger(ante)
  );
}

function isPlayerLimitValid(value: number, gameType: GameType): boolean {
  const max = gameType === "phom" ? 4 : gameType === "poker" ? 9 : 5;
  return !isNaN(value) && value >= 2 && value <= max;
}

function isTurnTimeoutValid(value: number): boolean {
  return !isNaN(value) && value >= 0 && value <= 90;
}

const normalizedFormValues = (
  formData: Partial<NewTableParams>,
): Partial<NewTableParams> => {
  const gameType: GameType =
    formData.gameType === "phom"
      ? "phom"
      : formData.gameType === "poker"
        ? "poker"
        : "sam";
  formData.gameType = gameType;
  formData.bo = gameType === "sam" ? Number(formData.bo || -1) : -1;
  formData.multiplier = Number(formData.multiplier || 10);
  formData.pokerMode =
    formData.pokerMode === "tournament" ? "tournament" : "cash";
  formData.buyIn = Number(formData.buyIn || 1000);
  formData.smallBlind = Number(formData.smallBlind || 5);
  formData.bigBlind = Number(
    formData.bigBlind || Math.max(10, formData.smallBlind * 2),
  );
  formData.ante = Number(formData.ante || 0);
  formData.playerLimit = Number(
    formData.playerLimit ||
      (gameType === "phom" ? 4 : gameType === "poker" ? 6 : 5),
  );
  formData.turnTimeout = Number(formData.turnTimeout || 0);

  return formData;
};

const NewTable = (props: {
  gameType: GameType;
  close: () => void;
  limit: number;
  onCreated?: (table: Table) => void;
}) => {
  const { t } = useI18n();
  const { localPlayer } = useLocalPlayer();
  const { createTable, tables } = useAppData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<Partial<NewTableParams>>({
    gameType: props.gameType,
    pokerMode: "cash",
    name: "",
    password: "",
    bo: "",
    multiplier: "",
    buyIn: "",
    smallBlind: "",
    bigBlind: "",
    ante: "",
    playerLimit: "",
    turnTimeout: "",
  } as never);

  const updateFormValue = (key: keyof Table, value: string) => {
    setForm((prev) => ({ ...prev, [key]: String(value) }));
  };

  const isFormValid = useCallback(() => {
    const checkingForm = normalizedFormValues({
      ...form,
      gameType: props.gameType,
    });
    const isSettingValid =
      checkingForm.gameType === "phom"
        ? isMultiplierValid(checkingForm.multiplier!)
        : checkingForm.gameType === "poker"
          ? isBuyInValid(checkingForm.buyIn!) &&
            isBlindsValid(
              checkingForm.smallBlind!,
              checkingForm.bigBlind!,
              checkingForm.ante!,
            )
          : isBoValid(checkingForm.bo!);
    return (
      isNameValid(checkingForm.name) &&
      isSettingValid &&
      isPlayerLimitValid(checkingForm.playerLimit!, checkingForm.gameType!) &&
      isTurnTimeoutValid(checkingForm.turnTimeout!)
    );
  }, [form, props.gameType]);

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
      ...normalizedFormValues({ ...form, gameType: props.gameType }),
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
        className="bg-white overflow-y-auto flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[30rem] max-w-[92%] max-h-[92%] gap-y-2"
        onSubmit={submit}
        autoComplete="off"
      >
        <p className="text-center text-lg">{t("table.newTitle")}</p>
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
        {props.gameType === "phom" ? (
          <input
            name="tblMultiplier"
            className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
            placeholder={t("table.multiplierPlaceholder")}
            type="number"
            min={1}
            value={form.multiplier}
            onInput={(e) => updateFormValue("multiplier", e.currentTarget.value)}
          />
        ) : props.gameType === "poker" ? (
          <>
            <div className="flex gap-x-2">
              <button
                type="button"
                className={`flex-1 py-1 text-sm border rounded-sm font-semibold ${
                  (form.pokerMode || "cash") === "cash"
                    ? "border-amber-600 bg-amber-200"
                    : "border-gray-300 bg-white"
                }`}
                onClick={() => updateFormValue("pokerMode", "cash")}
              >
                {t("table.pokerCash")}
              </button>
              <button
                type="button"
                className={`flex-1 py-1 text-sm border rounded-sm font-semibold ${
                  form.pokerMode === "tournament"
                    ? "border-amber-600 bg-amber-200"
                    : "border-gray-300 bg-white"
                }`}
                onClick={() => updateFormValue("pokerMode", "tournament")}
              >
                {t("table.pokerTournament")}
              </button>
            </div>
            <input
              name="tblBuyIn"
              className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
              placeholder={t("table.buyInPlaceholder")}
              type="number"
              min={1}
              value={form.buyIn}
              onInput={(e) => updateFormValue("buyIn", e.currentTarget.value)}
            />
            <input
              name="tblSmallBlind"
              className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
              placeholder={t("table.smallBlindPlaceholder")}
              type="number"
              min={1}
              value={form.smallBlind}
              onInput={(e) =>
                updateFormValue("smallBlind", e.currentTarget.value)
              }
            />
            <input
              name="tblBigBlind"
              className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
              placeholder={t("table.bigBlindPlaceholder")}
              type="number"
              min={1}
              value={form.bigBlind}
              onInput={(e) =>
                updateFormValue("bigBlind", e.currentTarget.value)
              }
            />
            <input
              name="tblAnte"
              className="w-full py-1 px-2 border border-gray-500 rounded-sm text-lg placeholder:text-sm"
              placeholder={t("table.antePlaceholder")}
              type="number"
              min={0}
              value={form.ante}
              onInput={(e) => updateFormValue("ante", e.currentTarget.value)}
            />
          </>
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
            props.gameType === "phom"
              ? t("table.phomPlayerLimitPlaceholder")
              : props.gameType === "poker"
                ? t("table.pokerPlayerLimitPlaceholder")
                : t("table.playerLimitPlaceholder")
          }
          type="number"
          min={2}
          max={
            props.gameType === "phom"
              ? 4
              : props.gameType === "poker"
                ? 9
                : 5
          }
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

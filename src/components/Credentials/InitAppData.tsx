/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import { isAblyApiKeyValid } from "@logic/util";

const InitAppData = () => {
  const { t } = useI18n();
  const { init, initPeer, getApiKey } = useAppData();
  const [apiKey, setApiKey] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(false);
  const didReadUrlRef = useRef(false);

  const initAppData = async (e?: FormEvent, key?: string) => {
    e?.preventDefault?.();
    setIsInitializing(true);
    const { error } = await init(key || apiKey);
    setIsInitializing(false);
    if (error) {
      alert(error.message);
    }
  };

  const pasteKey = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) {
        return;
      }
      setApiKey(clipboardText);
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    if (didReadUrlRef.current) return;
    didReadUrlRef.current = true;

    const url = new URL(window.location.href);

    if (url.searchParams.get("mode") === "peer") {
      url.searchParams.delete("mode");
      url.searchParams.delete("apiKey");
      window.history.replaceState({}, "", url.toString());
      initPeer();
      return;
    }

    let apiKey = url.searchParams.get("apiKey");
    apiKey = getApiKey("original", apiKey);
    setApiKey(apiKey);

    setTimeout(() => {
      if (url.searchParams.has("apiKey")) {
        url.searchParams.delete("apiKey");
        window.history.replaceState({}, "", url.toString());
      }
    }, 100);
  }, []);

  useEffect(() => {
    if (isAblyApiKeyValid(apiKey)) {
      initAppData();
      return;
    }

    if (!apiKey?.startsWith("http")) {
      return;
    }

    const url = new URL(apiKey);
    let _apiKey = url.searchParams.get("apiKey");
    _apiKey = getApiKey("original", _apiKey);
    if (_apiKey) {
      setApiKey(_apiKey);
    }

    const tblId = url.searchParams.get("tblId");
    const tblPw = url.searchParams.get("tblPw");
    if (tblId) {
      const newUrl = new URL(window.location.origin);
      newUrl.searchParams.set("tblId", tblId);
      if (tblPw) {
        newUrl.searchParams.set("tblPw", tblPw);
      }
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [apiKey]);

  return (
    <form
      className="mt-4 w-full flex flex-col items-center justify-center"
      onSubmit={initAppData}
      autoComplete="off"
    >
      <div className="text-sm w-full flex justify-between items-end">
        <span>{t("credentials.apiKeyLabel")}</span>
        <button
          type="button"
          className="!py-1 !px-4 border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
          onClick={pasteKey}
        >
          {t("credentials.paste")}
        </button>
      </div>
      <input
        name="apiKey"
        className="p-2 mt-1 border border-gray-500 rounded-sm w-[525px] max-w-full"
        autoFocus
        type="text"
        value={apiKey}
        placeholder={t("credentials.apiKeyPlaceholder")}
        onInput={(e) => setApiKey(e.currentTarget.value)}
      />
      <p className="text-sm w-full mt-2">
        <span>{t("credentials.getKey")}</span>
        <a
          href="https://ably.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-600"
        >
          {"https://ably.com"}
        </a>
      </p>
      <button
        type="submit"
        className={`bg-green-600 mt-6 w-full`}
        disabled={!apiKey || isInitializing}
      >
        {isInitializing ? t("credentials.checking") : t("common.next")}
      </button>
      <button
        type="button"
        className="mt-4 text-sm text-cyan-600"
        disabled={isInitializing}
        onClick={() => initPeer()}
      >
        {t("credentials.playWithoutAbly")}
      </button>
      <p className="text-xs text-gray-500 mt-1 text-center max-w-[525px]">
        {t("connection.fastBenefit")}
      </p>
    </form>
  );
};

export default InitAppData;

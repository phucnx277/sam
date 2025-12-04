/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";

const InitAppData = () => {
  const { init, getApiKey } = useAppData();
  const [apiKey, setApiKey] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(false);

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
    const url = new URL(window.location.href);
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
        <span>Your Ably API Key</span>
        <button
          type="button"
          className="!py-1 !px-4 border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
          onClick={pasteKey}
        >
          Paste
        </button>
      </div>
      <input
        name="apiKey"
        className="p-2 mt-1 border border-gray-500 rounded-sm w-[525px] max-w-full"
        autoFocus
        type="text"
        value={apiKey}
        placeholder="Ably API key"
        onInput={(e) => setApiKey(e.currentTarget.value)}
      />
      <p className="text-sm w-full mt-2">
        <span>Get a new key here: </span>
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
        className={`bg-green-600 mt-6`}
        disabled={!apiKey || isInitializing}
      >
        {isInitializing ? "Checking" : "Next"}
      </button>
    </form>
  );
};

function isAblyApiKeyValid(apiKey: string): boolean {
  return String(apiKey).length === 57 && apiKey.includes(":");
}

export default InitAppData;

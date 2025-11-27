import { useEffect, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";

const InitAppData = () => {
  const { init, getApiKey } = useAppData();
  const [key, setKey] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    let apiKey = url.searchParams.get("apiKey");
    apiKey = getApiKey("original", apiKey);
    setKey(apiKey);

    setTimeout(() => {
      if (url.searchParams.has("apiKey")) {
        url.searchParams.delete("apiKey");
        window.history.replaceState({}, "", url.toString());
      }
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initAppData = async (e: FormEvent) => {
    e.preventDefault();
    setIsInitializing(true);
    const { error } = await init(key);
    setIsInitializing(false);
    if (error) {
      alert(error.message);
    }
  };

  return (
    <form
      className="mt-4 w-full flex flex-col items-center justify-center"
      onSubmit={initAppData}
      autoComplete="off"
    >
      <p className="text-sm w-full">Your Ably API Key</p>
      <input
        name="apiKey"
        className="p-2 border border-gray-500 rounded-sm w-[525px] max-w-full"
        autoFocus
        type="text"
        value={key}
        placeholder="Ably API key"
        onInput={(e) => setKey(e.currentTarget.value)}
      />
      <p className="text-sm w-full mt-1">
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
        className={`bg-green-600 mt-4`}
        disabled={!key || isInitializing}
      >
        {isInitializing ? "Checking" : "Next"}
      </button>
    </form>
  );
};

export default InitAppData;

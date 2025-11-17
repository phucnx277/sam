import { useEffect, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";

const InitAppData = () => {
  const { init, getApiKey } = useAppData();
  const [key, setKey] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    let apiKey = url.searchParams.get("apiKey");
    if (!apiKey) {
      apiKey = getApiKey();
    }
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
    >
      <input
        name="apiKey"
        className="p-2 border border-gray-500 rounded-sm w-[525px] max-w-full"
        autoFocus
        type="text"
        value={key}
        placeholder="Input Abby API key"
        onInput={(e) => setKey(e.currentTarget.value)}
      />
      <button
        type="submit"
        className={`mt-4 bg-green-600`}
        disabled={!key || isInitializing}
      >
        {isInitializing ? "Checking" : "Next"}
      </button>
    </form>
  );
};

export default InitAppData;

import { useEffect, useState, type FormEvent } from "react";
import useAppData from "@hooks/useAppData";

const InitAppData = () => {
  const { init } = useAppData();
  const [key, setKey] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    const queryObj = new URLSearchParams(window.location.search);
    const apiKey = queryObj.get("apiKey");
    setKey(apiKey || "");
  }, []);

  const initAppData = async (e: FormEvent) => {
    e.preventDefault();
    setIsInitializing(true);
    const { error } = await init(key);
    setIsInitializing(false);
    if (error) {
      alert(error.message);
      setKey("");
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("apiKey", key);
    window.history.replaceState({}, "", url.toString());
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
        type="password"
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

import { useEffect, useCallback } from "react";
import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface A2hsState {
  promptEvent: BeforeInstallPromptEvent | null;
  setPromptEvent: (e: BeforeInstallPromptEvent | null) => void;
}

const useA2hsStore = create<A2hsState>((set) => ({
  promptEvent: null,
  setPromptEvent: (e) => set({ promptEvent: e }),
}));

const useAddToHomescreenPrompt = () => {
  const promptEvent = useA2hsStore((s) => s.promptEvent);
  const setPromptEvent = useA2hsStore((s) => s.setPromptEvent);

  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as BeforeInstallPromptEvent;
      evt.preventDefault();
      setPromptEvent(evt);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [setPromptEvent]);

  const promptToInstall = useCallback(async () => {
    if (!promptEvent) {
      return { outcome: "dismissed", platform: "" };
    }

    await promptEvent.prompt();
    const result = await promptEvent.userChoice;

    setPromptEvent(null);

    return result;
  }, [promptEvent, setPromptEvent]);

  return [promptEvent, promptToInstall] as const;
};

export default useAddToHomescreenPrompt;

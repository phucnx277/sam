import { useEffect, useState } from "react";

function useOrientation(): "portrait" | "landscape" {
  const getOrientation = () =>
    window.matchMedia("(orientation: portrait)").matches
      ? "portrait"
      : "landscape";

  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    getOrientation,
  );

  useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)");

    const handler = (e: MediaQueryListEvent) => {
      setOrientation(e.matches ? "portrait" : "landscape");
    };

    mql.addEventListener("change", handler);

    return () => {
      mql.removeEventListener("change", handler);
    };
  }, []);

  return orientation;
}

export default useOrientation;

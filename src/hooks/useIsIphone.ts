import { useEffect, useState } from "react";

function useIsIphone(): boolean {
  const [isIphone, setIsIphone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";

    const detected = /iPhone/i.test(ua);

    setIsIphone(detected);
  }, []);

  return isIphone;
}

export default useIsIphone;

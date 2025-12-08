import { useEffect, useState } from "react";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const detected =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIsMobile((navigator as any).userAgentData?.mobile || detected);
  }, []);

  return isMobile;
}

export default useIsMobile;

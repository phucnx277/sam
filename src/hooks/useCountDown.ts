import { calDurationSec } from "@logic/util";
import { useEffect, useState } from "react";

function useCountDown(ts: number, tick = 100) {
  const [durationSec, setDurationSec] = useState(
    Math.max(0, calDurationSec(ts)),
  );

  useEffect(() => {
    const iid = setInterval(() => {
      const ds = calDurationSec(ts);
      if (ds <= 0) {
        clearInterval(iid);
      }
      setDurationSec(Math.max(ds, 0));
    }, tick);
    return () => {
      clearInterval(iid);
    };
  }, [ts, tick]);

  return durationSec;
}

export default useCountDown;

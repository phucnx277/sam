import { type ReactNode, useEffect, useState } from "react";

const AutoFadeout = ({ children, ts }: { children: ReactNode; ts: number }) => {
  const [opacity, setOpacity] = useState(100);

  useEffect(() => {
    setOpacity(100);
    const iid = setInterval(() => {
      setOpacity((prev) => {
        if (prev <= 0) {
          clearInterval(iid);
          return prev;
        }
        return prev - 1;
      });
    }, 10);
    return () => {
      clearInterval(iid);
    };
  }, [ts]);

  return (
    <div
      className={`${opacity ? "z-2" : "-z-1"} flex items-center justify-center absolute top-0 left-0 bottom-0 right-0`}
      style={{ opacity: opacity + "%" }}
    >
      {children}
    </div>
  );
};

export default AutoFadeout;

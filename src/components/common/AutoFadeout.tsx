import { type ReactNode, useEffect, useState } from "react";

const AutoFadeout = ({ children, ts }: { children: ReactNode; ts: number }) => {
  const [opacity, setOpacity] = useState(100);

  useEffect(() => {
    setOpacity(100);
    const iid = setInterval(() => {
      setOpacity((prev) => prev - 1);
      if (opacity <= 0) {
        clearInterval(iid);
      }
    }, 10);
    return () => {
      clearInterval(iid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);

  return (
    <div
      className="z-20 flex items-center justify-center absolute top-0 left-0 bottom-0 right-0"
      style={{ opacity: opacity + "%" }}
    >
      {children}
    </div>
  );
};

export default AutoFadeout;

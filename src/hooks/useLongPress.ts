import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type UseLongPressOptions = {
  onLongPress: () => void;
  delay?: number;
  pressDelay?: number;
  moveTolerance?: number;
};

const useLongPress = ({
  onLongPress,
  delay = 1000,
  pressDelay = 200,
  moveTolerance = 10,
}: UseLongPressOptions) => {
  const [isHolding, setIsHolding] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    origin.current = null;
    setIsHolding(false);
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      origin.current = { x: event.clientX, y: event.clientY };
      fired.current = false;
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        setIsHolding(true);
        holdTimer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
          clear();
        }, delay);
      }, pressDelay);
    },
    [clear, delay, pressDelay, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!origin.current) return;
      const dx = event.clientX - origin.current.x;
      const dy = event.clientY - origin.current.y;
      if (Math.hypot(dx, dy) > moveTolerance) clear();
    },
    [clear, moveTolerance],
  );

  const consumeLongPress = useCallback(() => {
    const value = fired.current;
    fired.current = false;
    return value;
  }, []);

  return {
    isHolding,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
    consumeLongPress,
  };
};

export default useLongPress;

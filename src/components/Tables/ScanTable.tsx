import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import jsQR from "jsqr";
import useI18n from "@hooks/useI18n";

const ScanTable = (props: {
  onScan: (payload: string) => void;
  onClose: () => void;
}) => {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastDecode = 0;

    const decodeFrame = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(decodeFrame);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(decodeFrame);
        return;
      }
      const now = Date.now();
      if (now - lastDecode < 80) {
        rafRef.current = requestAnimationFrame(decodeFrame);
        return;
      }
      lastDecode = now;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let code: string | null = null;
      try {
        code =
          jsQR(imageData.data, imageData.width, imageData.height)?.data ?? null;
      } catch {
        code = null;
      }
      if (code) {
        stopCamera();
        props.onScan(code);
        return;
      }
      rafRef.current = requestAnimationFrame(decodeFrame);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(decodeFrame);
      } catch {
        stopCamera();
        if (!cancelled) {
          setError(t("lobby.scanError"));
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickImage = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const file = input.files?.[0];
      if (!file) return;
      input.value = "";
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          const maxSide = 1200;
          const scale = Math.min(
            1,
            maxSide / Math.max(image.naturalWidth, image.naturalHeight),
          );
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          try {
            const imageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const result = jsQR(
              imageData.data,
              imageData.width,
              imageData.height,
            );
            if (result?.data) {
              stopCamera();
              props.onScan(result.data);
            } else {
              setError(t("table.linkInvalid"));
            }
          } catch {
            setError(t("table.linkInvalid"));
          }
        }
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        setError(t("table.linkInvalid"));
        URL.revokeObjectURL(url);
      };
      image.src = url;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopCamera],
  );

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[18rem] max-w-[92%] gap-y-3 items-center">
        <div className="relative w-full aspect-square bg-black rounded-sm overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
        </div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <div className="w-full flex justify-center gap-x-4">
          <label className="!py-1 !px-0 w-[8rem] text-xs text-center border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300 cursor-pointer">
            {t("lobby.chooseImage")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickImage}
            />
          </label>
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={props.onClose}
          >
            {t("common.close")}
          </button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default ScanTable;

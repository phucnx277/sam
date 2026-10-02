import { useCallback, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";

const ShareTable = (props: { table: Table; onClose: () => void }) => {
  const { t } = useI18n();
  const { getApiKey, mode } = useAppData();

  const [copied, setCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const params = new URLSearchParams();
  if (mode === "peer") {
    params.set("mode", "peer");
  } else {
    params.set("apiKey", getApiKey("encoded"));
  }
  params.set("tblId", props.table.id);
  params.set("tblPw", props.table.password);
  const joinUrl = `${window.location.origin}?${params.toString()}`;

  const copyLink = useCallback(() => {
    if (!navigator.clipboard) {
      return;
    }
    navigator.clipboard
      .writeText(joinUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch((e) => {
        alert(e);
      });
  }, [joinUrl]);

  const downloadQr = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        try {
          const size = 1024;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          const anchor = document.createElement("a");
          anchor.href = canvas.toDataURL("image/png");
          anchor.download = `sam-${props.table.id}.png`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        } catch (e) {
          alert(e);
        }
      };
      img.onerror = (e) => {
        alert(e);
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        svgString,
      )}`;
    } catch (e) {
      alert(e);
    }
  }, [props.table.id]);

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white overflow-y-auto flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[22rem] max-w-[92%] max-h-[92%] gap-y-3 items-center">
        <div className="bg-white border border-gray-200 rounded-sm">
          <QRCodeSVG ref={svgRef} value={joinUrl} size={200} marginSize={4} />
        </div>
        <div className="w-full flex justify-center gap-x-4">
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={copyLink}
          >
            {copied ? t("table.linkCopied") : t("table.copyLink")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={downloadQr}
          >
            {t("table.downloadQr")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 flex-1 min-w-0 text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
            onClick={props.onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareTable;

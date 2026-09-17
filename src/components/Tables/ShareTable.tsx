import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";

const ShareTable = (props: { table: Table; onClose: () => void }) => {
  const { t } = useI18n();
  const { getApiKey } = useAppData();

  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}?apiKey=${getApiKey("encoded")}&tblId=${props.table.id}&tblPw=${props.table.password}`;

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

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[22rem] max-w-[92%] gap-y-3 items-center">
        <div className="text-lg text-center w-full text-ellipsis overflow-hidden whitespace-nowrap">
          <span>{t("table.nameLabel")}</span>
          <span className="font-semibold">{props.table.name}</span>
        </div>
        <div className="bg-white p-2 border border-gray-200 rounded-sm">
          <QRCodeSVG value={joinUrl} size={200} />
        </div>
        <p className="text-sm text-center">{t("table.scanNote")}</p>
        <div className="w-full flex justify-center gap-x-4">
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
            onClick={copyLink}
          >
            {copied ? t("table.linkCopied") : t("table.copyLink")}
          </button>
          <button
            type="button"
            className="!py-1 !px-0 w-[8rem] text-xs border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
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

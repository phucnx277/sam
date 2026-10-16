import { useEffect, useState } from "react";
import useAppData, { type PeerError } from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";
import type { TranslationKey } from "@logic/i18n";
import useLocalPlayer from "@hooks/useLocalPlayer";
import Credentials from "../Credentials/Credentials";
import Tables from "../Tables/Tables";
import AutoFadeout from "../common/AutoFadeout";
import useOrientation from "@hooks/useOrientation";

const peerErrorKey = (reason: PeerError): TranslationKey => {
  if (reason === "password") return "error.passwordIncorrect";
  if (reason === "full") return "error.peerFull";
  return "error.peerUnreachable";
};

const Lobby = () => {
  const { isInitialized, peerError, clearPeerError } = useAppData();
  const { localPlayer } = useLocalPlayer();
  const { t } = useI18n();
  const orientation = useOrientation();
  const [errorTs, setErrorTs] = useState(0);

  useEffect(() => {
    if (!peerError) return;
    setErrorTs(Date.now());
    const id = window.setTimeout(clearPeerError, 4000);
    return () => window.clearTimeout(id);
  }, [peerError, clearPeerError]);

  return (
    <div
      className={`h-full w-full max-w-full flex justify-center ${orientation === "portrait" ? "mt-20" : ""}`}
    >
      {!(isInitialized && localPlayer) && <Credentials />}
      {isInitialized && <Tables />}
      {!!peerError && (
        <AutoFadeout ts={errorTs}>
          <div className="bg-red-600 text-white px-4 py-2 rounded">
            {t(peerErrorKey(peerError))}
          </div>
        </AutoFadeout>
      )}
    </div>
  );
};

export default Lobby;

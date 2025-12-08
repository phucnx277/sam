import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import InitAppData from "./InitAppData";
import InputPlayerInfo from "./InputPlayerInfo";
import VersionInfo from "../common/VersionInfo";
import WelcomePlayer from "./WelcomePlayer";

const Credentials = () => {
  const { localPlayer } = useLocalPlayer();
  const { isInitialized } = useAppData();

  return (
    <div className="h-full max-w-full flex flex-col items-center justify-center">
      {!localPlayer && <InputPlayerInfo />}
      {!!localPlayer && (
        <>
          <WelcomePlayer />
          {!isInitialized && <InitAppData />}
        </>
      )}
      <div className="fixed top-2 right-2">
        <VersionInfo />
      </div>
    </div>
  );
};

export default Credentials;

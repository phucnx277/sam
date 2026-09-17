import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import InitAppData from "./InitAppData";
import InputPlayerInfo from "./InputPlayerInfo";
import TopRightBar from "../common/TopRightBar";
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
      <TopRightBar />
    </div>
  );
};

export default Credentials;

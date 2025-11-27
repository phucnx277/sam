import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import InitAppData from "./InitAppData";
import InputPlayerInfo from "./InputPlayerInfo";

const Credentials = () => {
  const { localPlayer } = useLocalPlayer();
  const { isInitialized } = useAppData();

  return (
    <div className="h-full max-w-full flex flex-col items-center justify-center">
      {!localPlayer && <InputPlayerInfo />}
      {!!localPlayer && (
        <>
          <p className="text-xl">
            Welcome, <span className="font-semibold">{localPlayer.name}</span>!
          </p>
          {!isInitialized && <InitAppData />}
        </>
      )}
    </div>
  );
};

export default Credentials;

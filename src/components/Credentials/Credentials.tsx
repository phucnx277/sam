import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import InitAppData from "./InitAppData";
import InputPlayerInfo from "./InputPlayerInfo";

const Credentials = () => {
  const { localPlayer: player } = useLocalPlayer();
  const { isInitialized } = useAppData();

  return (
    <>
      {(!isInitialized || !player) && (
        <div className="h-full max-w-full flex flex-col items-center justify-center">
          {!player && <InputPlayerInfo />}
          {!!player && (
            <>
              <p className="text-xl">
                Welcome, <span className="font-semibold">{player.name}</span>!
              </p>
              {!isInitialized && <InitAppData />}
            </>
          )}
        </div>
      )}
    </>
  );
};

export default Credentials;

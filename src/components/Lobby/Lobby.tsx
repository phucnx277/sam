import useAppData from "@hooks/useAppData";
import useLocalPlayer from "@hooks/useLocalPlayer";
import Credentials from "../Credentials/Credentials";
import Tables from "../Tables/Tables";

const Lobby = () => {
  const { isInitialized } = useAppData();
  const { localPlayer } = useLocalPlayer();
  return (
    <div className="h-full w-full max-w-full flex items-center justify-center">
      {!(isInitialized && localPlayer) && <Credentials />}
      {isInitialized && <Tables />}
    </div>
  );
};

export default Lobby;

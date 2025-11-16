import Credentials from "../Credentials/Credentials";
import Tables from "../Tables/Tables";

const Lobby = () => {
  return (
    <div className="h-full w-full max-w-full flex items-center justify-center">
      <Credentials />
      <Tables />
    </div>
  );
};

export default Lobby;

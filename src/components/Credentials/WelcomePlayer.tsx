import useLocalPlayer from "@hooks/useLocalPlayer";
import { exportPlayerInfo } from "@logic/player";

const WelcomePlayer = () => {
  const { localPlayer } = useLocalPlayer();
  const handleLogOut = () => {
    const cf = window.confirm("Are you sure?");
    if (cf) {
      localStorage.clear();
      window.location.href = window.location.origin;
    }
  };

  const copyPlayerPattern = async () => {
    if (!localPlayer) return;
    const content = exportPlayerInfo(localPlayer);
    try {
      await navigator.clipboard.writeText(content);
      alert("Player info copied");
    } catch {
      /* empty */
    }
  };

  return (
    <div className="flex items-center justify-start text-xl gap-1">
      <span>Welcome,</span>
      <span className="cursor-pointer" onClick={copyPlayerPattern}>
        <span className="font-semibold">{localPlayer!.name}</span>!
      </span>
      <button
        className="ml-4 text-sm rounded-sm !px-2 !py-0 border border-gray-500 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300"
        onClick={handleLogOut}
      >
        Log out
      </button>
    </div>
  );
};

export default WelcomePlayer;

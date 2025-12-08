import useAddToHomescreenPrompt from "@hooks/useAddToHomeScreenPrompt";

const VersionInfo = () => {
  const [prompt, promptToInstall] = useAddToHomescreenPrompt();

  const handleInstallClick = async () => {
    if (prompt) {
      const { outcome } = await promptToInstall();
      if (outcome === "accepted") {
        alert("App installed");
      }
    }
  };
  return (
    <div className="flex justify-end items-center gap-1">
      {prompt && (
        <button
          className="w-[5rem] !p-1 text-xs border border-cyan-300 hover:bg-cyan-300 active:bg-cyan-300 focus:bg-cyan-300"
          onClick={handleInstallClick}
        >
          Install App
        </button>
      )}
      <div className="text-xs text-gray-600">
        v{__APP_VERSION__} - {__COMMIT_HASH__}
      </div>
    </div>
  );
};

export default VersionInfo;

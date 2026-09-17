import LanguageSwitcher from "./LanguageSwitcher";
import VersionInfo from "./VersionInfo";

const TopRightBar = () => {
  return (
    <div className="fixed top-2 right-2 flex items-center gap-2">
      <LanguageSwitcher />
      <VersionInfo />
    </div>
  );
};

export default TopRightBar;

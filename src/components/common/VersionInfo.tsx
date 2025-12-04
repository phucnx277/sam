const VersionInfo = () => {
  return (
    <div className="text-xs text-gray-600">
      v{__APP_VERSION__} - {__COMMIT_HASH__}
    </div>
  );
};

export default VersionInfo;

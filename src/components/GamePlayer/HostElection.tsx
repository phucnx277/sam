import useAppData from "@hooks/useAppData";
import useI18n from "@hooks/useI18n";

const HostElection = () => {
  const { election, castVote, restartElection, playingTable } = useAppData();
  const { t } = useI18n();
  if (!election?.active) return null;

  const nameOf = (id: string): string =>
    playingTable?.game.players.find((p) => p.id === id)?.name ?? id;
  const voteCount = (id: string): number =>
    Object.values(election.votes).filter((vote) => vote === id).length;
  const candidates = election.participants.filter(
    (pid) => pid !== election.hostId,
  );
  const total = election.participants.length;
  const voted = Object.keys(election.votes).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-md p-4 w-full max-w-md">
        <h2 className="font-bold text-lg">{t("hostElection.title")}</h2>
        <p className="text-sm mt-1">{t("hostElection.subtitle")}</p>
        <p className="text-sm mt-2 text-gray-600">
          {t("hostElection.votesProgress", { count: voted, total })}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {candidates.map((pid) => (
            <button
              key={pid}
              type="button"
              className={
                election.selfVote === pid
                  ? "w-full !py-2 border border-green-600 bg-green-600 text-white"
                  : "w-full !py-2 border border-gray-400 hover:bg-gray-100"
              }
              disabled={election.failed}
              onClick={() => castVote(pid)}
            >
              {nameOf(pid)}
              {voteCount(pid) > 0 ? ` (${voteCount(pid)})` : ""}
            </button>
          ))}
        </div>
        {election.failed ? (
          <div className="mt-3">
            <p className="text-sm text-red-600">{t("hostElection.failed")}</p>
            <button
              type="button"
              className="mt-2 w-full !py-2 border border-gray-400 hover:bg-gray-100"
              onClick={restartElection}
            >
              {t("hostElection.retry")}
            </button>
          </div>
        ) : (
          !election.selfVote && (
            <p className="text-sm text-gray-500 mt-3">
              {t("hostElection.waiting")}
            </p>
          )
        )}
      </div>
    </div>
  );
};

export default HostElection;

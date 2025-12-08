import { memo } from "react";

const LobbyTable = memo(({ data }: { data: Table }) => {
  return (
    <div
      className={`h-full w-full flex flex-col justify-center items-center border rounded-sm ${data.game.state === "waiting" ? "bg-green-300 border-green-700" : data.game.state !== "ended" ? "bg-red-300 border-red-700" : "bg-gray-300 border-gray-700"}`}
    >
      <div className="font-semibold text-center text-ellipsis overflow-hidden whitespace-nowrap">
        {data.name}
      </div>
      <div className="mt-2 flex justify-between items-center gap-x-1 lg:gap-x-1.5">
        {data.game.players.map((player, index) => (
          <div
            key={player.id + index}
            className={`size-[0.8rem] lg:size-[1.1rem] rounded-[50%] ${data.game.state === "waiting" ? "bg-green-700" : data.game.state !== "ended" ? "bg-red-700" : "bg-gray-700"}`}
          ></div>
        ))}
      </div>
    </div>
  );
});
export default LobbyTable;

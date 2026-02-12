import { Player } from "@/types/room";

export function ParticipantsRoster({
  publishedAssignments,
  allPlayers,
  playerId,
}: {
  publishedAssignments: Record<string, number>;
  allPlayers: Record<string, Player> | null;
  playerId: string;
}) {
  if (!allPlayers) return null;

  const myTable = publishedAssignments[playerId] ?? 0;
  if (myTable <= 0) return null;

  // 同卓メンバーのみ抽出
  const tablemates = Object.entries(publishedAssignments)
    .filter(([, tableNum]) => tableNum === myTable)
    .map(([pid]) => {
      const player = allPlayers[pid];
      if (!player) return null;
      return { id: pid, name: player.name };
    })
    .filter(Boolean) as { id: string; name: string }[];

  if (tablemates.length === 0) return null;

  return (
    <div>
      <div className="rounded p-2 bg-blue-900/40 border border-blue-700">
        <p className="text-xs font-semibold mb-1 text-blue-300">
          テーブル {myTable}
        </p>
        <div className="flex flex-wrap gap-1">
          {tablemates.map(({ id, name }) => (
            <span
              key={id}
              className={`text-xs px-1.5 py-0.5 rounded ${
                id === playerId
                  ? "bg-blue-600 text-white font-semibold"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

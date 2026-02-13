import { Player, EntryField } from "@/types/room";

export function ParticipantsRoster({
  publishedAssignments,
  allPlayers,
  playerId,
  entryFields,
  tableCount,
}: {
  publishedAssignments: Record<string, number>;
  allPlayers: Record<string, Player> | null;
  playerId: string;
  entryFields?: EntryField[];
  tableCount?: number;
}) {
  if (!allPlayers) return null;

  const myTable = publishedAssignments[playerId] ?? 0;
  if (myTable <= 0) return null;

  // showInHeader のフィールド（名前以外）
  const headerFields = (entryFields || []).filter((f) => f.id !== "name" && f.showInHeader);

  // テーブルごとにプレイヤーを分類
  const tables: Record<number, { id: string; player: Player }[]> = {};
  const numTables = tableCount || Math.max(...Object.values(publishedAssignments), 0);
  for (let t = 1; t <= numTables; t++) tables[t] = [];

  Object.entries(publishedAssignments).forEach(([pid, tNum]) => {
    if (tNum > 0 && allPlayers[pid]) {
      if (!tables[tNum]) tables[tNum] = [];
      tables[tNum].push({ id: pid, player: allPlayers[pid] });
    }
  });

  return (
    <div className="space-y-2">
      {Object.entries(tables)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([tableNum, members]) => {
          const tNum = Number(tableNum);
          const isMyTable = tNum === myTable;
          return (
            <div
              key={tNum}
              className={`rounded p-2 border ${
                isMyTable
                  ? "bg-blue-900/40 border-blue-700"
                  : "bg-gray-800/40 border-gray-700/50"
              }`}
            >
              <p className={`text-xs font-semibold mb-1 ${isMyTable ? "text-blue-300" : "text-gray-400"}`}>
                テーブル {tNum}
                {isMyTable && <span className="ml-1 text-[10px] text-blue-400">← あなた</span>}
                <span className="ml-1 text-[10px] text-gray-500">({members.length}人)</span>
              </p>
              <div className="space-y-0.5">
                {members.map(({ id, player }) => (
                  <div key={id} className="flex items-center gap-2 px-1 py-0.5">
                    <span className={`text-xs font-bold ${
                      id === playerId ? "text-blue-300" : "text-white"
                    }`}>
                      {player.name}
                    </span>
                    {headerFields.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {headerFields.map((f) => `${f.label}：${player.fields?.[f.id] ?? ""}`).join(" / ")}
                      </span>
                    )}
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-xs text-gray-600 px-1">（空席）</p>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

import { Player, ScenarioStep, EntryField, TimelineSnapshot } from "@/types/room";
import { resolveMessage, getDefaultDisplay } from "@/lib/timeline";
import { TableBadge } from "./TableBadge";

// タイムラインカード
export function TimelineCard({
  stepIndex,
  step,
  player,
  snapshot,
  prevSnapshot,
  isCurrent,
  entryFields,
  allPlayers,
  playerId,
}: {
  stepIndex: number;
  step: ScenarioStep;
  player: Player;
  snapshot?: TimelineSnapshot;
  prevSnapshot?: TimelineSnapshot;
  isCurrent: boolean;
  entryFields: EntryField[];
  allPlayers?: Record<string, Player> | null;
  playerId?: string | null;
}) {
  const display = step.display || getDefaultDisplay(step);
  // 現在のステップはライブデータ、過去のステップはスナップショット
  const tableNum = isCurrent ? player.tableNumber : (snapshot?.tableNumber ?? player.tableNumber);

  // テーブルメイト: 現在のステップはライブデータから取得、過去はスナップショット
  const tablemates: string[] = (() => {
    if (!isCurrent) return snapshot?.tablemates ?? [];
    if (!allPlayers || !playerId || tableNum <= 0) return [];
    return Object.entries(allPlayers)
      .filter(([pid, p]) => pid !== playerId && p.tableNumber === tableNum)
      .map(([, p]) => p.name);
  })();
  // テーブルが前のステップから変わったか
  const tableChanged = prevSnapshot && prevSnapshot.tableNumber > 0 && tableNum > 0 && tableNum !== prevSnapshot.tableNumber;

  return (
    <div className="relative pl-6 pb-6">
      {/* タイムラインの縦線 */}
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
      {/* ドット */}
      <div className={`absolute left-0.5 top-1.5 w-3 h-3 rounded-full border-2 border-gray-950 ${isCurrent ? "bg-green-500" : "bg-blue-500"}`} />

      <div className={`bg-gray-900 rounded-lg p-4 border ${isCurrent ? "border-green-800" : "border-gray-800"}`}>
        <p className="text-xs text-gray-500 mb-2">
          Step {stepIndex + 1}: {step.label}
        </p>

        {/* テーブル変更通知 */}
        {tableChanged && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 mb-2 text-center">
            <p className="text-xs text-yellow-400">テーブルが変わりました</p>
            <p className="text-sm font-bold text-yellow-300">テーブル {prevSnapshot.tableNumber} → {tableNum}</p>
          </div>
        )}

        {/* メッセージ */}
        {display.message && (
          <p className="text-sm font-medium mb-2 whitespace-pre-wrap">
            {resolveMessage(display.message, player)}
          </p>
        )}

        {/* テーブル番号（entryステップ） */}
        {step.type === "entry" && (
          <div className="mb-2">
            <TableBadge tableNum={tableNum} />
          </div>
        )}

        {/* テーブル番号（entry以外でテーブル情報を出す場合） */}
        {step.type !== "entry" && tableNum > 0 && display.showTablemates && !tableChanged && (
          <div className="bg-gray-800 rounded p-2 mb-2 text-center">
            <p className="text-xs text-gray-400">テーブル {tableNum}</p>
          </div>
        )}

        {/* テーブルメイト */}
        {display.showTablemates && tablemates.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1">テーブル{tableNum}のメンバー:</p>
            <p className="text-sm text-gray-300">{tablemates.join("、")}</p>
          </div>
        )}

        {/* 表示フィールド */}
        {display.showFields && display.showFields.length > 0 && snapshot?.fieldValues && (
          <div className="space-y-1">
            {display.showFields.map((fieldId) => {
              const field = entryFields.find((f) => f.id === fieldId);
              const val = snapshot.fieldValues?.[fieldId];
              if (!field || val === undefined || val === "") return null;
              return (
                <div key={fieldId} className="flex justify-between text-xs">
                  <span className="text-gray-500">{field.label}</span>
                  <span className="text-gray-300">{String(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

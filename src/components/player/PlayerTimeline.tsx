import { useState } from "react";
import { Room, Player, EntryField, ScenarioStep, TimelineSnapshot, AdminMessage } from "@/types/room";
import { TimelineCard } from "./TimelineCard";
import { MessageCard } from "./MessageCard";
import { ParticipantsRoster } from "./ParticipantsRoster";

// タイムラインアイテム型
type TimelineItem =
  | { kind: "step"; index: number; step: ScenarioStep }
  | { kind: "message"; message: AdminMessage };

// タイムライン描画（参加者画面とプレビューの共通部分）
export function PlayerTimeline({
  room,
  playerData,
  playerId,
  allPlayers,
  entryFields,
  snapshots,
  publishedTableNumber,
  publishedAssignments,
  messages,
  children,
}: {
  room: Room;
  playerData: Player;
  playerId: string;
  allPlayers: Record<string, Player> | null;
  entryFields: EntryField[];
  snapshots: Record<number, TimelineSnapshot>;
  publishedTableNumber: number;
  publishedAssignments?: Record<string, number>;
  messages: AdminMessage[];
  // 各ステップの追加コンテンツ（アンケート入力、ゲーム等）を差し込む
  children?: (item: { step: ScenarioStep; index: number; isCurrent: boolean }) => React.ReactNode;
}) {
  const steps = room.scenario?.steps || [];
  const currentStep = room.state.currentStep;

  // メッセージをターゲットでフィルタ
  const filteredMessages = messages.filter((msg) => {
    if (msg.target.type === "all") return true;
    if (msg.target.type === "table" && msg.target.tableNumber === publishedTableNumber) return true;
    if (msg.target.type === "player" && msg.target.playerId === playerId) return true;
    return false;
  });

  // ステップカードとメッセージを時系列で統合
  const timelineItems: TimelineItem[] = [];
  for (let idx = 0; idx <= currentStep; idx++) {
    if (!steps[idx]) continue;
    timelineItems.push({ kind: "step", index: idx, step: steps[idx] });
    const stepMessages = filteredMessages
      .filter((m) => m.sentDuringStep === idx)
      .sort((a, b) => a.sentAt - b.sentAt);
    for (const msg of stepMessages) {
      timelineItems.push({ kind: "message", message: msg });
    }
  }

  const [showTablemates, setShowTablemates] = useState(false);

  // ヘッダーに表示するフィールド
  const headerFields = entryFields.filter((f) => f.id !== "name" && f.showInHeader);

  // 同卓メンバー（名前＋エントリー情報）
  const tablemates = publishedAssignments && allPlayers
    ? Object.entries(publishedAssignments)
        .filter(([pid, tbl]) => tbl === publishedTableNumber && pid !== playerId)
        .map(([pid]) => {
          const p = allPlayers[pid];
          if (!p) return null;
          const extras = headerFields
            .map((f) => p.fields?.[f.id])
            .filter(Boolean);
          return { name: p.name, extras };
        })
        .filter(Boolean) as { name: string; extras: (string | number)[] }[]
    : [];

  return (
    <>
      {/* ヘッダー */}
      <div className="sticky top-0 bg-gray-950/90 backdrop-blur py-3 z-10">
        <div className="text-center">
          <h1 className="text-lg font-bold">{room.config.eventName}</h1>
          <p className="text-gray-400 text-xs">{room.config.eventDate}</p>
        </div>
        {publishedTableNumber > 0 && (
          <div className="mt-2 mx-auto max-w-xs bg-gray-800/80 rounded-lg border border-gray-700/50 overflow-hidden">
            <button
              onClick={() => setShowTablemates(!showTablemates)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm transition hover:bg-gray-700/30"
            >
              <span className="px-2 py-0.5 bg-blue-900 text-blue-300 rounded text-xs font-semibold">
                テーブル {publishedTableNumber}
              </span>
              <span className="text-white text-xs font-bold">
                {playerData.name}
              </span>
              {tablemates.length > 0 && (
                <span className="text-gray-400 text-xs">+ {tablemates.length}名</span>
              )}
              <span className="text-gray-500 text-xs">{showTablemates ? "▲" : "▼"}</span>
            </button>
            {showTablemates && tablemates.length > 0 && (
              <div className="border-t border-gray-700/50 px-3 py-2 space-y-1">
                {tablemates.map((mate, i) => (
                  <div key={i} className="flex items-center gap-2 px-1 py-0.5">
                    <span className="text-xs text-white font-bold">{mate.name}</span>
                    {mate.extras.length > 0 && (
                      <span className="text-xs text-white">{mate.extras.join(" / ")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* タイムライン */}
      <div className="pb-8">
        {timelineItems.map((item) => {
          if (item.kind === "message") {
            return (
              <div key={`msg-${item.message.id}`} className="animate-panel-in">
                <MessageCard
                  message={item.message}
                  senderName={room.config.adminName}
                />
              </div>
            );
          }
          const idx = item.index;
          const isCurrent = idx === currentStep;
          return (
            <div key={`step-${idx}`}>
              <TimelineCard
                stepIndex={idx}
                step={item.step}
                player={playerData}
                snapshot={snapshots[idx]}
                prevSnapshot={idx > 0 ? snapshots[idx - 1] : undefined}
                isCurrent={isCurrent}
                publishedTableNumber={publishedTableNumber}
                timestamp={room.state.stepTimestamps?.[`s${idx}`] ?? room.state.stepTimestamps?.[String(idx)]}
              />
              {/* 参加者一覧ステップ */}
              {item.step.type === "participants" && publishedAssignments && (
                <div className="relative pl-6 pb-2 -mt-4 animate-panel-in" style={{ animationDelay: "0.15s" }}>
                  <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                  <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                    <ParticipantsRoster
                      publishedAssignments={publishedAssignments}
                      allPlayers={allPlayers}
                      playerId={playerId}
                    />
                  </div>
                </div>
              )}
              {/* 各ステップの追加コンテンツ（子から注入） */}
              {children?.({ step: item.step, index: idx, isCurrent })}
            </div>
          );
        })}
      </div>
    </>
  );
}

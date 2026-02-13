"use client";

import { useState } from "react";
import { Room, Player, EntryField, AdminMessage } from "@/types/room";
import { PlayerTimeline } from "@/components/player/PlayerTimeline";
import { SurveyInput } from "@/components/player/SurveyInput";
import { SurveyOpenInput } from "@/components/player/SurveyOpenInput";
import { SurveyResults } from "@/components/player/SurveyResults";
import { GameQuestion } from "@/components/player/GameQuestion";
import { PastGameLog } from "@/components/player/PastGameLog";
import { RevealDisplay } from "@/components/player/RevealDisplay";
import { ParticipantsRoster } from "@/components/player/ParticipantsRoster";
import { StreamsBoard } from "@/components/player/StreamsBoard";

export interface PlayerPreviewPanelProps {
  room: Room;
  players: Record<string, Player> | null;
  onPublishTables: () => void;
}

export default function PlayerPreviewPanel({
  room,
  players,
  onPublishTables,
}: PlayerPreviewPanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const published = room.publishedTables;
  const history = room.publishHistory;

  // プレイヤーリスト
  const playerList = players
    ? Object.entries(players).sort((a, b) => a[1].name.localeCompare(b[1].name))
    : [];

  // 初期選択（最初のプレイヤー）
  const activePlayerId = selectedPlayerId && players?.[selectedPlayerId]
    ? selectedPlayerId
    : playerList[0]?.[0] ?? null;
  const activePlayer = activePlayerId && players ? players[activePlayerId] : null;

  // published table number（参加者と同じロジック）
  const publishedTableNumber = activePlayerId
    ? (published?.assignments?.[activePlayerId] ?? 0)
    : 0;
  const publishedAssignments = published?.assignments;

  // エントリーフィールド
  const DEFAULT_ENTRY_FIELDS: EntryField[] = [
    { id: "name", label: "名前", type: "text", required: true },
  ];
  const entryFields = room.config.entryFields?.length
    ? room.config.entryFields
    : DEFAULT_ENTRY_FIELDS;

  // 全メッセージ
  const allMessages: AdminMessage[] = room.messages
    ? Object.values(room.messages)
    : [];

  // 差分があるか
  const hasDiff = (() => {
    if (!published || !players) return false;
    return Object.entries(players).some(([pid, p]) => {
      return (published.assignments?.[pid] ?? 0) !== p.tableNumber;
    });
  })();

  // 履歴（新しい順）
  const historyEntries = history
    ? Object.entries(history)
        .map(([key, entry]) => ({ key, ...entry }))
        .sort((a, b) => b.pushedAt - a.pushedAt)
    : [];

  return (
    <section className="bg-gray-900 rounded-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-700 pb-2">
        <h2 className="text-lg font-semibold">参加者イメージ</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-2 py-1 rounded text-xs transition ${
              showHistory ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            履歴
          </button>
          <button
            onClick={onPublishTables}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold transition"
          >
            プッシュ
          </button>
        </div>
      </div>

      {/* 未公開の変更警告 */}
      {hasDiff && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded p-2">
          <p className="text-xs text-orange-400 font-semibold">
            未公開の変更があります — プッシュすると参加者に反映されます
          </p>
        </div>
      )}

      {/* プッシュ状態 */}
      <p className="text-xs text-gray-500">
        {published
          ? `最終プッシュ: ${new Date(published.pushedAt).toLocaleString("ja-JP")}`
          : "まだプッシュされていません — 参加者にテーブル番号は見えません"}
      </p>

      {/* プレイヤー選択 */}
      {playerList.length > 0 ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">プレビュー対象</label>
          <select
            value={activePlayerId || ""}
            onChange={(e) => setSelectedPlayerId(e.target.value || null)}
            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
          >
            {playerList.map(([pid, player]) => (
              <option key={pid} value={pid}>
                {player.name}
                {published?.assignments?.[pid] !== undefined
                  ? ` (T${published.assignments[pid]})`
                  : " (未割当)"}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-gray-500">参加者がいません</p>
      )}

      {/* プッシュ履歴 */}
      {showHistory && (
        <div className="border border-gray-700 rounded p-3 space-y-2">
          <h3 className="text-xs font-semibold text-gray-400">プッシュ履歴</h3>
          {historyEntries.length === 0 ? (
            <p className="text-xs text-gray-500">まだ履歴はありません</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {historyEntries.map((entry, i) => {
                const entryByTable: Record<number, string[]> = {};
                if (players) {
                  Object.entries(entry.assignments).forEach(([pid, tableNum]) => {
                    if (tableNum <= 0) return;
                    const name = players[pid]?.name || pid.slice(0, 6);
                    if (!entryByTable[tableNum]) entryByTable[tableNum] = [];
                    entryByTable[tableNum].push(name);
                  });
                }
                const tableNums = Object.keys(entryByTable).map(Number).sort((a, b) => a - b);

                return (
                  <div
                    key={entry.key}
                    className={`rounded p-2 border text-xs ${
                      i === 0 ? "bg-blue-900/20 border-blue-700/50" : "bg-gray-800/50 border-gray-700"
                    }`}
                  >
                    <span className="text-gray-400">
                      {new Date(entry.pushedAt).toLocaleString("ja-JP")}
                    </span>
                    {i === 0 && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 bg-blue-800 text-blue-300 rounded">現在</span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {tableNums.map((t) => (
                        <span key={t} className="text-gray-400">
                          T{t}: <span className="text-gray-300">{entryByTable[t].join(", ")}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 参加者画面プレビュー */}
      {activePlayer && activePlayerId && (
        <div className="border-2 border-gray-700 rounded-xl overflow-hidden bg-gray-950">
          {/* スマホ風フレーム */}
          <div className="bg-gray-800 px-3 py-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-500">参加者プレビュー</span>
            <span className="text-[10px] text-gray-400 font-medium">{activePlayer.name}</span>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            <PlayerTimeline
              room={room}
              playerData={activePlayer}
              playerId={activePlayerId}
              allPlayers={players}
              entryFields={entryFields}
              snapshots={{}}
              publishedTableNumber={publishedTableNumber}
              publishedAssignments={publishedAssignments}
              messages={allMessages}
            >
              {({ step, index: idx, isCurrent }) => {
                const currentStep = room.state.currentStep;
                return (
                  <>
                    {/* アンケート集計 */}
                    {step.type === "survey" && step.survey && (
                      <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                        <SurveyInput
                          roomId=""
                          stepIndex={idx}
                          step={step}
                          playerId={activePlayerId}
                          playerName={activePlayer.name}
                          tableNumber={publishedTableNumber}
                          existingResponse={room.stepResponses?.[String(idx)]?.[activePlayerId]}
                        />
                      </div>
                    )}
                    {/* アンケート回答 */}
                    {step.type === "survey_open" && step.survey && (
                      <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                        <SurveyOpenInput
                          roomId=""
                          stepIndex={idx}
                          step={step}
                          playerId={activePlayerId}
                          playerName={activePlayer.name}
                          tableNumber={publishedTableNumber}
                          existingResponse={room.stepResponses?.[String(idx)]?.[activePlayerId]}
                        />
                      </div>
                    )}
                    {/* アンケート結果 */}
                    {step.type === "survey_result" && step.survey?.questionStepIndex !== undefined && (
                      <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                        <SurveyResults
                          room={room}
                          questionStepIndex={step.survey.questionStepIndex}
                          playerTableNumber={publishedTableNumber}
                          playerId={activePlayerId}
                        />
                      </div>
                    )}
                    {/* ゲーム */}
                    {(step.type === "table_game" || step.type === "whole_game") && (() => {
                      const isStreamsGame = step.gameType === "krukkurin" || step.gameType === "meta_streams";
                      if (isCurrent && isStreamsGame && room.currentGame?.streams) {
                        return (
                          <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                            <StreamsBoard roomId="" room={room} playerId={activePlayerId} />
                          </div>
                        );
                      }
                      if (isCurrent && !isStreamsGame && room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0) {
                        return (
                          <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                            <GameQuestion
                              roomId=""
                              room={room}
                              playerId={activePlayerId}
                              playerName={activePlayer.name}
                              tableNumber={publishedTableNumber}
                              allPlayers={players}
                              stepGameType={step.gameType}
                            />
                          </div>
                        );
                      }
                      const pastResult = room.gameResults?.[String(idx)];
                      if (!isCurrent && pastResult) {
                        return (
                          <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                            <PastGameLog gameResult={pastResult} playerId={activePlayerId} allPlayers={players} />
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* 回答開示 */}
                    {step.type === "reveal" && (
                      <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                          {step.reveal ? (
                            <RevealDisplay
                              room={room}
                              sourceStepIndex={step.reveal.sourceStepIndex}
                              displayType={step.reveal.displayType}
                              scope={step.reveal.scope}
                              playerId={activePlayerId}
                              playerTableNumber={publishedTableNumber}
                              allPlayers={players}
                            />
                          ) : (
                            <p className="text-sm text-gray-500">回答開示の設定がありません</p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 参加者一覧 */}
                    {step.type === "participants" && publishedAssignments && (
                      <div className="relative pl-6 pb-2 -mt-4" style={{ animationDelay: "0.15s" }}>
                        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
                        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                          <ParticipantsRoster
                            publishedAssignments={publishedAssignments}
                            allPlayers={players}
                            playerId={activePlayerId}
                            entryFields={entryFields}
                            tableCount={room.config.tableCount}
                            showToUnassigned={room.config.showRosterToUnassigned}
                          />
                        </div>
                      </div>
                    )}
                  </>
                );
              }}
            </PlayerTimeline>
          </div>
        </div>
      )}
    </section>
  );
}

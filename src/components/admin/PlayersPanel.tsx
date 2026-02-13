"use client";

import { useState } from "react";
import { Room, Player, EntryField } from "@/types/room";
import { updateEntryFields, updateRoomConfigField } from "@/lib/room";

export interface PlayersPanelProps {
  room: Room;
  players: Record<string, Player> | null;
  playersByTable: Record<number, { id: string; player: Player }[]>;
  assigningPlayer: string | null;
  setAssigningPlayer: (v: string | null) => void;
  onAssignTable: (playerId: string, tableNumber: number) => void;
  onKickPlayer: (playerId: string, playerName: string) => void;
  roomId: string;
  onPublishTables: () => void;
}

export default function PlayersPanel({
  room,
  players,
  playersByTable,
  assigningPlayer,
  setAssigningPlayer,
  onAssignTable,
  onKickPlayer,
  roomId,
  onPublishTables,
}: PlayersPanelProps) {
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);

  const onlineCount = players
    ? Object.values(players).filter((p) => p.connected).length
    : 0;
  const totalCount = players ? Object.keys(players).length : 0;

  const detailPlayer = detailPlayerId && players ? players[detailPlayerId] : null;
  const entryFields = room.config.entryFields || [];

  // 公開済みテーブル情報との差分チェック
  const publishedAssignments = room.publishedTables?.assignments;
  const hasUnpublished = (id: string, player: Player): boolean => {
    if (!publishedAssignments) return player.tableNumber !== 0;
    return publishedAssignments[id] !== player.tableNumber;
  };

  return (
    <section className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-2">
        <h2 className="text-lg font-semibold">
          参加者・テーブル割り当て
        </h2>
        {totalCount > 0 && (
          <span className="text-xs text-gray-400">
            <span className="text-green-400">{onlineCount}</span>/{totalCount}人 接続中
          </span>
        )}
      </div>

      {/* テーブル情報プッシュ */}
      {totalCount > 0 && (
        <div className="mb-4 p-2 bg-gray-800 rounded border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">
                {room.publishedTables
                  ? `最終プッシュ: ${new Date(room.publishedTables.pushedAt).toLocaleTimeString("ja-JP")}`
                  : "未プッシュ"}
              </p>
            </div>
            <button
              onClick={onPublishTables}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold transition"
            >
              テーブル情報をプッシュ
            </button>
          </div>
        </div>
      )}

      {/* 卓表示設定 */}
      <div className="mb-4 p-2 bg-gray-800 rounded border border-gray-700">
        <p className="text-xs text-white font-bold mb-2">卓表示設定</p>
        {entryFields.filter((f) => f.id !== "name").length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {entryFields.map((field, i) => {
              if (field.id === "name") return null;
              return (
                <label key={field.id} className="flex items-center gap-1.5 text-xs text-white">
                  <input
                    type="checkbox"
                    checked={field.showInHeader || false}
                    onChange={async (e) => {
                      const newFields = entryFields.map((f, j) =>
                        j === i ? { ...f, showInHeader: e.target.checked || undefined } : f
                      );
                      await updateEntryFields(roomId, newFields);
                    }}
                  />
                  {field.label}
                </label>
              );
            })}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-white">
          <input
            type="checkbox"
            checked={room.config.showRosterToUnassigned || false}
            onChange={async (e) => {
              await updateRoomConfigField(roomId, "showRosterToUnassigned", e.target.checked || null);
            }}
          />
          テーブル未割当者にも参加者一覧を表示
        </label>
      </div>

      {!players || Object.keys(players).length === 0 ? (
        <p className="text-gray-500 text-sm">参加者待ち...</p>
      ) : (
        <div className="space-y-4">
          {/* 未割当エリア（新規参加者） */}
          {(playersByTable[0]?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm text-yellow-400 mb-1 font-semibold">
                未割当（{playersByTable[0].length}人）
              </p>
              <div className="space-y-1">
                {playersByTable[0].map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      className="px-2 py-1 rounded text-sm bg-yellow-900/30 text-yellow-300 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${player.connected ? "bg-green-400" : "bg-gray-600"}`} />
                        {player.name}
                        {hasUnpublished(id, player) && (
                          <span className="text-[10px] text-orange-400">(未公開)</span>
                        )}
                      </span>
                      <span className="flex gap-1">
                        <button
                          onClick={() => setDetailPlayerId(detailPlayerId === id ? null : id)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                          className="text-xs text-yellow-500 hover:text-yellow-300"
                        >
                          割当 ▾
                        </button>
                      </span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1).map((tNum) => (
                          <button
                            key={tNum}
                            onClick={() => onAssignTable(id, tNum)}
                            className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                          >
                            T{tNum}
                          </button>
                        ))}
                        <button
                          onClick={() => onAssignTable(id, -1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
                        >
                          テーブル外
                        </button>
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* テーブル別エリア */}
          {Array.from(
            { length: room.config.tableCount || 0 },
            (_, i) => i + 1
          ).map((tableNum) => (
            <div key={tableNum}>
              <p className="text-sm text-gray-400 mb-1">
                テーブル {tableNum}
                <span className="text-xs text-gray-600 ml-1">
                  ({playersByTable[tableNum]?.length || 0}人)
                </span>
              </p>
              <div className="space-y-1">
                {playersByTable[tableNum]?.map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      className={`px-2 py-1 rounded text-sm flex items-center justify-between ${
                        player.connected
                          ? "bg-green-900/30 text-green-300"
                          : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${player.connected ? "bg-green-400" : "bg-gray-600"}`} />
                        {player.name}
                        {hasUnpublished(id, player) && (
                          <span className="text-[10px] text-orange-400">(未公開)</span>
                        )}
                      </span>
                      <span className="flex gap-1">
                        <button
                          onClick={() => setDetailPlayerId(detailPlayerId === id ? null : id)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                          className="text-xs text-gray-500 hover:text-gray-300"
                        >
                          移動 ▾
                        </button>
                      </span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1)
                          .filter((t) => t !== tableNum)
                          .map((tNum) => (
                            <button
                              key={tNum}
                              onClick={() => onAssignTable(id, tNum)}
                              className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                            >
                              T{tNum}
                            </button>
                          ))}
                        <button
                          onClick={() => onAssignTable(id, -1)}
                          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
                        >
                          テーブル外
                        </button>
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                )) || <p className="text-xs text-gray-600">（空席）</p>}
              </div>
            </div>
          ))}

          {/* テーブル外エリア（プール） */}
          {(playersByTable[-1]?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-1 font-semibold">
                テーブル外（{playersByTable[-1].length}人）
              </p>
              <div className="space-y-1">
                {playersByTable[-1].map(({ id, player }) => (
                  <div key={id} className="relative">
                    <div
                      className="px-2 py-1 rounded text-sm bg-gray-800 text-gray-500 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${player.connected ? "bg-green-400" : "bg-gray-600"}`} />
                        {player.name}
                        {hasUnpublished(id, player) && (
                          <span className="text-[10px] text-orange-400">(未公開)</span>
                        )}
                      </span>
                      <span className="flex gap-1">
                        <button
                          onClick={() => setDetailPlayerId(detailPlayerId === id ? null : id)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => setAssigningPlayer(assigningPlayer === id ? null : id)}
                          className="text-xs text-gray-600 hover:text-gray-400"
                        >
                          移動 ▾
                        </button>
                      </span>
                    </div>
                    {assigningPlayer === id && (
                      <div className="mt-1 bg-gray-800 border border-gray-600 rounded p-2 flex flex-wrap gap-1">
                        <button
                          onClick={() => onAssignTable(id, 0)}
                          className="px-2 py-1 bg-yellow-800 hover:bg-yellow-700 rounded text-xs transition"
                        >
                          未割当
                        </button>
                        {Array.from({ length: room.config.tableCount || 0 }, (_, i) => i + 1).map((tNum) => (
                          <button
                            key={tNum}
                            onClick={() => onAssignTable(id, tNum)}
                            className="px-2 py-1 bg-gray-700 hover:bg-blue-600 rounded text-xs transition"
                          >
                            T{tNum}
                          </button>
                        ))}
                        <button
                          onClick={() => onKickPlayer(id, player.name)}
                          className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs transition text-red-300"
                        >
                          キック
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* プレイヤー詳細モーダル */}
      {detailPlayer && detailPlayerId && (
        <PlayerDetailModal
          playerId={detailPlayerId}
          player={detailPlayer}
          room={room}
          entryFields={entryFields}
          onClose={() => setDetailPlayerId(null)}
        />
      )}
    </section>
  );
}

// プレイヤー詳細モーダル
function PlayerDetailModal({
  playerId,
  player,
  room,
  entryFields,
  onClose,
}: {
  playerId: string;
  player: Player;
  room: Room;
  entryFields: EntryField[];
  onClose: () => void;
}) {
  const steps = room.scenario?.steps || [];

  // アンケート回答を収集
  const surveyResponses: { stepIndex: number; label: string; question: string; response: string | number }[] = [];
  if (room.stepResponses) {
    Object.entries(room.stepResponses).forEach(([stepIdxStr, responses]) => {
      const stepIdx = Number(stepIdxStr);
      const step = steps[stepIdx];
      if (step?.type === "survey" && step.survey && responses[playerId]) {
        surveyResponses.push({
          stepIndex: stepIdx,
          label: step.label,
          question: step.survey.question,
          response: responses[playerId].value,
        });
      }
    });
  }

  // ゲーム回答を収集
  const gameAnswers: { questionId: string; questionText: string; answer: string }[] = [];
  if (room.currentGame?.questions && room.currentGame?.answers) {
    Object.entries(room.currentGame.questions).forEach(([qId, q]) => {
      const playerAnswer = room.currentGame?.answers?.[qId]?.[playerId];
      if (playerAnswer) {
        gameAnswers.push({
          questionId: qId,
          questionText: q.text,
          answer: playerAnswer.text,
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{player.name} の詳細</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* 基本情報 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-400 mb-2">基本情報</h4>
            <div className="bg-gray-800 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">名前</span>
                <span className="text-white">{player.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">テーブル</span>
                <span className="text-white">
                  {player.tableNumber > 0 ? `テーブル ${player.tableNumber}` : player.tableNumber === -1 ? "テーブル外" : "未割当"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">接続状態</span>
                <span className={player.connected ? "text-green-400" : "text-gray-500"}>
                  {player.connected ? "接続中" : "オフライン"}
                </span>
              </div>
              {/* エントリーフィールド */}
              {entryFields.filter(f => f.id !== "name").map((field) => (
                <div key={field.id} className="flex justify-between text-sm">
                  <span className="text-gray-500">{field.label}</span>
                  <span className="text-white">{player.fields?.[field.id] ?? "未入力"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* アンケート回答 */}
          {surveyResponses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">アンケート回答（{surveyResponses.length}件）</h4>
              <div className="space-y-2">
                {surveyResponses.map((sr, i) => (
                  <div key={i} className="bg-gray-800 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">{sr.label}: {sr.question}</p>
                    <p className="text-sm text-white">{sr.response}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ゲーム回答 */}
          {gameAnswers.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">ゲーム回答（{gameAnswers.length}件）</h4>
              <div className="space-y-2">
                {gameAnswers.map((ga, i) => (
                  <div key={i} className="bg-gray-800 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">{ga.questionText}</p>
                    <p className="text-sm text-white">{ga.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {surveyResponses.length === 0 && gameAnswers.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">まだ回答がありません</p>
          )}
        </div>

        <div className="border-t border-gray-700 p-4">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

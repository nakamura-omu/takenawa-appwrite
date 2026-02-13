"use client";

import { useState } from "react";
import { Room, ScenarioStep, GameQuestion, Answer, AnswerRevealScope, GameType } from "@/types/room";
import {
  setPhase,
  startGame,
  startGameWithAutoProgress,
  sendQuestion,
  closeQuestion,
  reopenQuestion,
  revealAnswers,
  hideAnswers,
  resetCurrentGame,
  toggleScoreboard,
  forceAdvanceTable,
  forceAdvanceAllTables,
} from "@/lib/room";
import { calculateTotalScores } from "@/lib/scoring";
import StreamsControls from "./StreamsControls";

export interface GameControlsProps {
  roomId: string;
  room: Room;
  step: ScenarioStep;
  questionText: string;
  setQuestionText: (v: string) => void;
}

// 回答方法の日本語ラベル
function inputTypeLabel(type: "text" | "number" | "select"): string {
  switch (type) {
    case "text": return "テキスト";
    case "number": return "数値";
    case "select": return "選択肢";
  }
}

// 回答集計コンポーネント（選択肢は集計、テキスト/数値はリスト）
function AnswerSummary({
  answers,
  inputType,
  options,
  players,
}: {
  answers: Record<string, Answer>;
  inputType: "text" | "number" | "select";
  options?: string[];
  players?: Record<string, { name: string; tableNumber: number }> | null;
}) {
  const entries = Object.entries(answers);
  if (entries.length === 0) {
    return <p className="text-xs text-gray-500">回答なし</p>;
  }

  // 選択肢の場合：集計表示
  if (inputType === "select" && options && options.length > 0) {
    const counts: Record<string, number> = {};
    options.forEach((opt) => { counts[opt] = 0; });
    entries.forEach(([, ans]) => {
      if (counts[ans.text] !== undefined) {
        counts[ans.text]++;
      } else {
        counts[ans.text] = 1; // 選択肢外の回答
      }
    });
    const total = entries.length;

    return (
      <div className="space-y-1">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([opt, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={opt} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-gray-300 truncate">{opt}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-1">{count}票 ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    );
  }

  // テキスト/数値の場合：回答一覧（テーブル番号順→提出順）
  return (
    <div className="space-y-0.5 max-h-32 overflow-y-auto">
      {entries
        .sort((a, b) => {
          const tA = players?.[a[0]]?.tableNumber ?? 999;
          const tB = players?.[b[0]]?.tableNumber ?? 999;
          if (tA !== tB) return tA - tB;
          return a[1].submittedAt - b[1].submittedAt;
        })
        .map(([pid, ans]) => {
          const p = players?.[pid];
          const label = p ? `${p.tableNumber}:${p.name}` : pid.slice(0, 6);
          return (
            <div key={pid} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-20 shrink-0 truncate">{label}</span>
              <span className="text-gray-300">{ans.text}</span>
            </div>
          );
        })}
    </div>
  );
}

// ゲームタイプの日本語ラベル
function gameTypeLabel(type: GameType): string {
  switch (type) {
    case "tuning_gum": return "チューニングガム";
    case "good_line": return "いい線行きましょう";
    case "evens": return "みんなのイーブン";
    case "krukkurin": return "くるっくりん";
    case "meta_streams": return "メタストリームス";
    default: return type;
  }
}

export default function GameControls({
  roomId,
  room,
  step,
  questionText,
  setQuestionText,
}: GameControlsProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [playerSelectQuestion, setPlayerSelectQuestion] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [showScores, setShowScores] = useState(false);

  // 元のインデックスを保持しつつフィルタ
  const allQuestions = step.config?.questions || [];
  const presetQuestions = allQuestions
    .map((q, originalIndex) => ({ q, originalIndex }))
    .filter(({ q }) => q?.text?.trim());
  const hasPresets = presetQuestions.length > 0;
  const sentIndices = room.currentGame?.sentQuestionIndices || [];

  const handleSendPresetQuestion = (q: GameQuestion, originalIndex: number) => {
    sendQuestion(
      roomId,
      q.text.trim(),
      q.inputType,
      q.options?.filter(o => o.trim()),
      originalIndex
    );
  };

  const handleSendManualQuestion = () => {
    if (questionText.trim()) {
      sendQuestion(roomId, questionText.trim(), "text");
      setQuestionText("");
    }
  };

  const toggleExpand = (qId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  };

  const currentGame = room.currentGame;
  const isGameActive = !!currentGame;

  // スコア計算（ゲームアクティブ時、管理者は全回答を対象）
  const gameType = currentGame?.type || step.gameType;
  const scores = currentGame && currentGame.answers && gameType
    ? calculateTotalScores(
        gameType,
        currentGame.answers,
        "whole",
      )
    : {};

  const handleStartGame = () => {
    const gameType = step.gameType;
    if (!gameType) return;
    const scope = step.type === "table_game" ? "table" : "whole";
    startGame(roomId, gameType, scope, false);
  };

  const handleStartAutoProgress = () => {
    const gameType = step.gameType;
    if (!gameType) return;
    const validQuestions = (step.config?.questions || []).filter(q => q?.text?.trim());
    if (validQuestions.length === 0) return;
    startGameWithAutoProgress(roomId, gameType, validQuestions);
  };

  // Streams系ゲームは専用コントロールを使用
  const isStreamsGame = step.gameType === "krukkurin" || step.gameType === "meta_streams";
  if (isStreamsGame) {
    return <StreamsControls roomId={roomId} room={room} step={step} />;
  }

  return (
    <div className="border-t border-gray-700 pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-2">ゲーム操作</p>

      {/* ゲーム開始（未開始時） */}
      {!isGameActive && step.gameType && (
        <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-700">
          <p className="text-xs text-gray-400 mb-2">
            {gameTypeLabel(step.gameType)} — {step.type === "table_game" ? "テーブル" : "全体"}モード
          </p>
          <div className="space-y-1.5">
            <button
              onClick={handleStartGame}
              className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold transition"
            >
              ゲーム開始（手動進行）
            </button>
            {step.type === "table_game" && presetQuestions.length > 0 && (
              <button
                onClick={handleStartAutoProgress}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-sm font-semibold transition"
              >
                テーブル自動進行で開始（{presetQuestions.length}問）
              </button>
            )}
          </div>
        </div>
      )}

      {/* ゲーム情報（開始後） */}
      {isGameActive && (
        <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span className="px-1.5 py-0.5 bg-green-900 text-green-300 rounded">実行中</span>
            <span>{gameTypeLabel(currentGame.type)}</span>
            <span className="text-gray-600">|</span>
            <span>{currentGame.scope === "table" ? "テーブル" : "全体"}</span>
            {currentGame.autoProgress && (
              <span className="px-1.5 py-0.5 bg-cyan-900 text-cyan-300 rounded">自動進行</span>
            )}
          </div>
        </div>
      )}

      {/* テーブル自動進行の進捗表示 */}
      {isGameActive && currentGame.autoProgress && currentGame.questionOrder && (() => {
        const questionOrder = currentGame.questionOrder!;
        const totalQ = questionOrder.length;
        const tableCount = room.config.tableCount;
        const tableProgress = currentGame.tableProgress || {};

        // テーブルごとの回答状況を集計
        const assignments = room.publishedTables?.assignments || {};
        const getTablePlayerCount = (t: number) =>
          Object.entries(assignments).filter(([pid, tNum]) => tNum === t && room.players?.[pid]).length;
        const getTableAnswerCount = (t: number, qIdx: number) => {
          if (qIdx >= totalQ) return 0;
          const qId = questionOrder[qIdx];
          const ans = currentGame.answers?.[qId] || {};
          return Object.entries(assignments)
            .filter(([pid, tNum]) => tNum === t && room.players?.[pid] && ans[pid])
            .length;
        };

        const allDone = Array.from({ length: tableCount }, (_, i) => i + 1)
          .every(t => (tableProgress[`table_${t}`] ?? 0) >= totalQ);

        return (
          <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-700">
            <p className="text-xs text-gray-500 mb-2">テーブル進捗（全{totalQ}問）</p>
            <div className="space-y-1.5">
              {Array.from({ length: tableCount }, (_, i) => i + 1).map(t => {
                const progress = tableProgress[`table_${t}`] ?? 0;
                const isDone = progress >= totalQ;
                const playerCount = getTablePlayerCount(t);
                const currentAnswers = getTableAnswerCount(t, progress);

                if (playerCount === 0) return null;

                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-8 shrink-0">T{t}</span>
                    {/* プログレスバー */}
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isDone ? "bg-green-500" : "bg-cyan-500"}`}
                        style={{ width: `${Math.round((progress / totalQ) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs w-16 shrink-0 text-right ${isDone ? "text-green-400" : "text-gray-300"}`}>
                      {isDone ? "完了" : `${progress + 1}問目`}
                    </span>
                    {!isDone && (
                      <>
                        <span className="text-xs text-gray-500 w-12 shrink-0 text-right">
                          {currentAnswers}/{playerCount}
                        </span>
                        <button
                          onClick={() => forceAdvanceTable(roomId, t)}
                          className="px-1.5 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs transition shrink-0"
                          title="強制的に次の問題へ"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {!allDone && (
              <button
                onClick={() => {
                  // 最も遅いテーブルの進捗 + 1 まで全テーブルを進行
                  const minProgress = Math.min(
                    ...Array.from({ length: tableCount }, (_, i) => tableProgress[`table_${i + 1}`] ?? 0)
                  );
                  forceAdvanceAllTables(roomId, minProgress + 1);
                }}
                className="mt-2 w-full py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs font-semibold transition"
              >
                遅れているテーブルを次の問題へ
              </button>
            )}
            {allDone && (
              <p className="mt-2 text-xs text-green-400 font-semibold text-center">全テーブル完了!</p>
            )}
          </div>
        );
      })()}

      {/* 事前設定のお題リスト */}
      {hasPresets && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">
            事前設定のお題（{presetQuestions.length}問、送出済み {sentIndices.length}問）:
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {presetQuestions.map(({ q, originalIndex }, i) => {
              const isSent = sentIndices.includes(originalIndex);
              return (
                <div key={originalIndex} className={`flex items-center gap-2 rounded px-2 py-1.5 ${isSent ? "bg-gray-800/50" : "bg-gray-800"}`}>
                  <span className="text-xs text-gray-500 w-6">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm block truncate ${isSent ? "text-gray-500" : "text-gray-300"}`}>{q.text}</span>
                    <span className="text-xs text-gray-500">
                      {inputTypeLabel(q.inputType)}
                      {q.inputType === "select" && q.options && ` (${q.options.filter(o => o.trim()).length}択)`}
                    </span>
                  </div>
                  {isSent ? (
                    <span className="px-2 py-0.5 bg-gray-600 text-gray-400 rounded text-xs shrink-0">送出済</span>
                  ) : (
                    <button
                      onClick={() => handleSendPresetQuestion(q, originalIndex)}
                      className="px-2 py-0.5 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold transition shrink-0"
                    >
                      送出
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 手動入力（テキストのみ） */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder={hasPresets ? "または手動でお題を入力（テキスト回答）..." : "お題を入力（テキスト回答）..."}
          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSendManualQuestion}
          disabled={!questionText.trim()}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm transition"
        >
          送出
        </button>
      </div>

      {/* 送出済みお題ログ（問題ごとに操作・集計） */}
      {room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-500 mb-1">送出済みお題:</p>
          <div className="space-y-1.5">
            {Object.entries(room.currentGame.questions)
              .sort(([, a], [, b]) => (a.sentAt || 0) - (b.sentAt || 0))
              .map(([qId, q], i) => {
                const isActive = qId === room.currentGame?.activeQuestionId;
                const answers = room.currentGame?.answers?.[qId] || {};
                const answerCount = Object.keys(answers).length;
                const isExpanded = expandedQuestions.has(qId);

                return (
                  <div
                    key={qId}
                    className={`rounded border ${
                      isActive
                        ? "bg-gray-700/80 border-gray-500"
                        : "bg-gray-800/50 border-gray-700/50"
                    }`}
                  >
                    {/* ヘッダー行 */}
                    <div className="px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{i + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <span className={`text-sm ${isActive ? "font-medium text-white" : "text-gray-300"}`}>
                            {q.text}
                          </span>
                          {q.inputType !== "text" && (
                            <span className="text-xs text-gray-500 ml-1">({inputTypeLabel(q.inputType)})</span>
                          )}
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
                          q.status === "open" ? "bg-green-600 text-white"
                          : q.status === "closed" ? "bg-yellow-600 text-white"
                          : "bg-blue-600 text-white"
                        }`}>
                          {q.status === "open" ? "受付中" : q.status === "closed" ? "締切" : "公開済"}
                        </span>
                      </div>

                      {/* 操作ボタン行 */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {/* 締切 ↔ 受付再開 */}
                        {q.status === "open" && (
                          <button
                            onClick={() => closeQuestion(roomId, qId)}
                            className="px-2 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs transition"
                          >
                            締切
                          </button>
                        )}
                        {q.status === "closed" && (
                          <button
                            onClick={() => reopenQuestion(roomId, qId)}
                            className="px-2 py-0.5 bg-green-700 hover:bg-green-600 rounded text-xs transition"
                          >
                            受付再開
                          </button>
                        )}
                        {/* 公開 ↔ 非公開 */}
                        {q.status === "revealed" ? (
                          <button
                            onClick={() => hideAnswers(roomId, qId)}
                            className="px-2 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
                          >
                            非公開に戻す
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => revealAnswers(roomId, qId, { type: "all" })}
                              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 rounded text-xs transition"
                            >
                              全体公開
                            </button>
                            <button
                              onClick={() => revealAnswers(roomId, qId, { type: "table" })}
                              className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-700 rounded text-xs transition"
                            >
                              テーブル公開
                            </button>
                            <button
                              onClick={() => {
                                setPlayerSelectQuestion(playerSelectQuestion === qId ? null : qId);
                                setSelectedPlayerIds(new Set());
                              }}
                              className={`px-2 py-0.5 rounded text-xs transition ${
                                playerSelectQuestion === qId
                                  ? "bg-purple-600 text-white"
                                  : "bg-purple-700 hover:bg-purple-600"
                              }`}
                            >
                              個別公開
                            </button>
                          </>
                        )}
                        {q.status === "revealed" && (
                          <span className="text-xs text-gray-500">
                            {q.revealScope?.type === "table" ? "(テーブル公開)"
                              : q.revealScope?.type === "players" ? `(個別公開: ${q.revealScope.playerIds.length}名)`
                              : "(全体公開)"}
                          </span>
                        )}
                        <button
                          onClick={() => toggleExpand(qId)}
                          className={`px-2 py-0.5 rounded text-xs transition ml-auto ${
                            isExpanded
                              ? "bg-gray-600 text-white"
                              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                          }`}
                        >
                          回答 {answerCount}件 {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    {/* 個別公開プレイヤー選択 */}
                    {playerSelectQuestion === qId && (
                      <div className="px-2.5 py-2 border-t border-purple-700/30 bg-purple-900/10">
                        <p className="text-xs text-purple-400 mb-1.5">公開する参加者を選択:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
                          {Object.entries(room.players || {}).map(([pid, player]) => {
                            const hasAnswer = !!answers[pid];
                            return (
                              <label
                                key={pid}
                                className={`flex items-center gap-2 text-xs cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-800 ${
                                  !hasAnswer ? "opacity-40" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPlayerIds.has(pid)}
                                  onChange={(e) => {
                                    setSelectedPlayerIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(pid);
                                      else next.delete(pid);
                                      return next;
                                    });
                                  }}
                                  className="rounded text-purple-500"
                                />
                                <span className="text-gray-300">{player.name}</span>
                                {!hasAnswer && <span className="text-gray-600">(未回答)</span>}
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (selectedPlayerIds.size === 0) return;
                              revealAnswers(roomId, qId, {
                                type: "players",
                                playerIds: Array.from(selectedPlayerIds),
                              });
                              setPlayerSelectQuestion(null);
                              setSelectedPlayerIds(new Set());
                            }}
                            disabled={selectedPlayerIds.size === 0}
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-xs font-semibold transition"
                          >
                            {selectedPlayerIds.size}名の回答を公開
                          </button>
                          <button
                            onClick={() => {
                              setPlayerSelectQuestion(null);
                              setSelectedPlayerIds(new Set());
                            }}
                            className="px-2 py-1 text-gray-400 hover:text-gray-200 text-xs transition"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 回答集計（エキスパンド） */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 border-t border-gray-700/50 pt-2">
                        <AnswerSummary
                          answers={answers}
                          inputType={q.inputType}
                          options={q.options}
                          players={room.players}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* スコアボード（管理者用） */}
      {isGameActive && Object.keys(scores).length > 0 && (() => {
        const questions = room.currentGame?.questions || {};
        const totalQ = Object.keys(questions).length;
        const revealedQ = Object.values(questions).filter((q) => q.status === "revealed").length;
        const isScoreboardOn = !!room.currentGame?.showScoreboard;
        return (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setShowScores(!showScores)}
              className={`px-2 py-1 rounded text-xs transition ${showScores ? "bg-yellow-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
            >
              {revealedQ === totalQ ? "スコア（最終）" : `途中経過（${revealedQ}/${totalQ}問）`} {showScores ? "▲" : "▼"}
            </button>
            <button
              onClick={() => toggleScoreboard(roomId, !isScoreboardOn)}
              className={`px-2 py-1 rounded text-xs font-semibold transition ${
                isScoreboardOn
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-300"
              }`}
            >
              {isScoreboardOn ? "参加者にスコア表示中" : "参加者にスコアを表示"}
            </button>
          </div>
          {showScores && (
            <div className="mt-2 p-2 bg-gray-800 rounded border border-gray-700 space-y-1 max-h-40 overflow-y-auto">
              {Object.entries(scores)
                .sort((a, b) => b[1] - a[1])
                .map(([pid, score]) => {
                  const p = room.players?.[pid];
                  const label = p ? `${p.tableNumber}:${p.name}` : pid.slice(0, 6);
                  return (
                    <div key={pid} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 flex-1 truncate">{label}</span>
                      <span className="text-white font-semibold">{score}pt</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
        );
      })()}

      {/* グローバル操作 */}
      <div className="flex gap-2 flex-wrap">
        {!isGameActive && (
          <button onClick={() => setPhase(roomId, "playing")} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition">回答受付開始</button>
        )}
        {room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0 && (
          <button
            onClick={() => {
              if (confirm("全てのお題と回答をリセットしますか？")) {
                resetCurrentGame(roomId);
              }
            }}
            className="px-2 py-1 bg-red-900/50 hover:bg-red-800 rounded text-xs text-red-300 transition"
          >
            全リセット
          </button>
        )}
      </div>
    </div>
  );
}

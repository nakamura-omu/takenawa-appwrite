"use client";

import { Room, ScenarioStep, GameQuestion } from "@/types/room";
import {
  setPhase,
  sendQuestion,
  closeQuestion,
  revealAnswers,
  resetCurrentGame,
} from "@/lib/room";

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

export default function GameControls({
  roomId,
  room,
  step,
  questionText,
  setQuestionText,
}: GameControlsProps) {
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
      step.config?.timeLimit || 30,
      q.inputType,
      q.options?.filter(o => o.trim()),
      originalIndex
    );
  };

  const handleSendManualQuestion = () => {
    if (questionText.trim()) {
      sendQuestion(roomId, questionText.trim(), step.config?.timeLimit || 30, "text");
      setQuestionText("");
    }
  };

  return (
    <div className="border-t border-gray-700 pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-2">ゲーム操作</p>

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

      {/* 送出済みお題ログ */}
      {room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gray-500 mb-1">送出済みお題ログ:</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {Object.entries(room.currentGame.questions)
              .sort(([, a], [, b]) => (b.sentAt || 0) - (a.sentAt || 0))
              .map(([qId, q]) => {
                const isActive = qId === room.currentGame?.activeQuestionId;
                const answerCount = room.currentGame?.answers?.[qId]
                  ? Object.keys(room.currentGame.answers[qId]).length
                  : 0;
                return (
                  <div
                    key={qId}
                    className={`p-2 rounded text-sm ${isActive ? "bg-gray-700 border border-gray-600" : "bg-gray-800/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        {isActive && <span className="text-xs text-blue-400 mr-1">▶</span>}
                        <span className={isActive ? "font-medium" : "text-gray-400"}>{q.text}</span>
                        <span className="text-xs text-gray-500 ml-2">({inputTypeLabel(q.inputType)})</span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ml-2 ${
                        q.status === "open" ? "bg-green-600 text-white"
                        : q.status === "closed" ? "bg-yellow-600 text-white"
                        : "bg-blue-600 text-white"
                      }`}>
                        {q.status === "open" ? "受付中" : q.status === "closed" ? "締切" : "公開済"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">回答: {answerCount}件</p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setPhase(roomId, "playing")} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition">回答受付開始</button>
        <button onClick={() => closeQuestion(roomId)} className="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs transition">回答締切</button>
        <button onClick={() => revealAnswers(roomId)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition">結果公開</button>
        {room.currentGame?.questions && Object.keys(room.currentGame.questions).length > 0 && (
          <button
            onClick={() => {
              if (confirm("全てのお題と回答をリセットしますか？")) {
                resetCurrentGame(roomId);
              }
            }}
            className="px-2 py-1 bg-red-900/50 hover:bg-red-800 rounded text-xs text-red-300 transition"
          >
            リセット
          </button>
        )}
      </div>
    </div>
  );
}

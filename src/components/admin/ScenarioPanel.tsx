"use client";

import { useState, useEffect } from "react";
import { Room, Player, ScenarioStep, StepType, GameType } from "@/types/room";
import {
  goToNextStep,
  goToPrevStep,
  setPhase,
  sendQuestion,
  closeQuestion,
  revealAnswers,
  shuffleTables,
  updateScenario,
  insertStepAfterCurrent,
  subscribeToStepResponses,
  setStepReveal,
  clearStepReveal,
} from "@/lib/room";
import {
  StepInputConfig,
  StepResponse,
  StepInputReveal,
  RevealMode,
} from "@/types/room";
import MessageSender from "./MessageSender";

export interface ScenarioPanelProps {
  roomId: string;
  room: Room;
  players: Record<string, Player> | null;
}

// ステップタイプごとのデフォルトメッセージ
function getDefaultMessage(step: ScenarioStep): string {
  switch (step.type) {
    case "entry": return "エントリー完了！";
    case "break": return "歓談タイムです";
    case "end": return "お疲れさまでした！";
    default: return step.label;
  }
}

// ステップタイプの日本語ラベル
function stepTypeLabel(type: StepType): string {
  switch (type) {
    case "entry": return "受付";
    case "table_game": return "テーブルゲーム";
    case "whole_game": return "全体ゲーム";
    case "break": return "歓談";
    case "result": return "結果発表";
    case "end": return "閉会";
    default: return type;
  }
}

export default function ScenarioPanel({
  roomId,
  room,
  players,
}: ScenarioPanelProps) {
  const [questionText, setQuestionText] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // 個別ステップ編集（進行モード内）
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState<ScenarioStep | null>(null);

  // 台本編集モード
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioStep[]>([]);

  // 割り込みステップ
  const [showInterrupt, setShowInterrupt] = useState(false);
  const [interruptLabel, setInterruptLabel] = useState("");
  const [interruptType, setInterruptType] = useState<StepType>("break");
  const [interruptMessage, setInterruptMessage] = useState("");
  const [interruptAutoAdvance, setInterruptAutoAdvance] = useState(true);

  const steps = room.scenario?.steps || [];

  // === 個別ステップ編集（即時保存） ===

  const handleStartStepEdit = (index: number) => {
    setStepDraft({ ...steps[index] });
    setEditingStep(index);
    setExpandedStep(index);
  };

  const handleSaveStepEdit = async () => {
    if (editingStep === null || !stepDraft || !stepDraft.label.trim()) return;
    const newSteps = steps.map((s, i) => (i === editingStep ? stepDraft : s));
    await updateScenario(roomId, newSteps);
    setEditingStep(null);
    setStepDraft(null);
  };

  const handleCancelStepEdit = () => {
    setEditingStep(null);
    setStepDraft(null);
  };

  const updateStepDraft = (updates: Partial<ScenarioStep>) => {
    if (!stepDraft) return;
    setStepDraft({ ...stepDraft, ...updates });
  };

  // === 台本編集モード ===

  const handleEnterScenarioMode = () => {
    setScenarioDraft(steps.map((s) => ({ ...s })));
    setScenarioMode(true);
    setEditingStep(null);
    setStepDraft(null);
  };

  const handleSaveScenario = async () => {
    await updateScenario(roomId, scenarioDraft);
    setScenarioMode(false);
  };

  const handleCancelScenario = () => {
    setScenarioMode(false);
    setScenarioDraft([]);
  };

  // 台本モード: ステップ操作
  const draftUpdate = (index: number, updates: Partial<ScenarioStep>) => {
    setScenarioDraft(scenarioDraft.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const draftMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= scenarioDraft.length) return;
    const newSteps = [...scenarioDraft];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setScenarioDraft(newSteps);
  };

  const draftRemove = (index: number) => {
    setScenarioDraft(scenarioDraft.filter((_, i) => i !== index));
  };

  const draftInsert = (afterIndex: number) => {
    const newStep: ScenarioStep = { type: "break", label: "" };
    const newSteps = [...scenarioDraft];
    newSteps.splice(afterIndex + 1, 0, newStep);
    setScenarioDraft(newSteps);
  };

  const draftAppend = () => {
    setScenarioDraft([...scenarioDraft, { type: "break", label: "" }]);
  };

  // テーブルシャッフル
  const handleShuffleTables = async () => {
    if (!confirm("テーブル割り当て済みの参加者をランダムに再配分しますか？")) return;
    await shuffleTables(roomId);
  };

  // 割り込みステップ挿入
  const handleInsertInterrupt = async () => {
    if (!interruptLabel.trim()) return;
    const newStep: ScenarioStep = {
      type: interruptType,
      label: interruptLabel.trim(),
      display: interruptMessage.trim() ? { message: interruptMessage.trim() } : undefined,
    };
    await insertStepAfterCurrent(roomId, newStep, interruptAutoAdvance);
    setShowInterrupt(false);
    setInterruptLabel("");
    setInterruptType("break");
    setInterruptMessage("");
    setInterruptAutoAdvance(true);
  };

  // =========================================
  // レンダー
  // =========================================

  return (
    <section className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-2">
        <h2 className="text-lg font-semibold">台本・進行</h2>
        {!scenarioMode && editingStep === null && (
          <button
            onClick={handleEnterScenarioMode}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            台本を編集
          </button>
        )}
      </div>

      {scenarioMode ? (
        /* ========== 台本編集モード ========== */
        <div>
          <div className="space-y-1 mb-4">
            {scenarioDraft.map((step, idx) => (
              <div key={idx}>
                {/* 挿入ボタン（先頭） */}
                {idx === 0 && (
                  <button
                    onClick={() => { const ns = [...scenarioDraft]; ns.splice(0, 0, { type: "break", label: "" }); setScenarioDraft(ns); }}
                    className="w-full py-1 text-xs text-gray-600 hover:text-gray-400 transition"
                  >
                    + ここに挿入
                  </button>
                )}
                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                  <div className="flex gap-1 items-center mb-2">
                    <span className="text-xs text-gray-500 mr-1">Step {idx + 1}</span>
                    <button onClick={() => draftMove(idx, -1)} disabled={idx === 0} className="px-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs">↑</button>
                    <button onClick={() => draftMove(idx, 1)} disabled={idx === scenarioDraft.length - 1} className="px-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs">↓</button>
                    <button onClick={() => draftRemove(idx)} className="ml-auto px-1 text-red-400 hover:text-red-300 text-xs">削除</button>
                  </div>
                  {/* 基本設定 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ラベル</label>
                      <input
                        type="text"
                        value={step.label}
                        onChange={(e) => draftUpdate(idx, { label: e.target.value })}
                        placeholder="ステップ名"
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">タイプ</label>
                      <select
                        value={step.type}
                        onChange={(e) => {
                          const newType = e.target.value as StepType;
                          const updates: Partial<ScenarioStep> = { type: newType };
                          if (newType !== "table_game" && newType !== "whole_game") {
                            updates.gameType = undefined;
                            updates.config = undefined;
                          }
                          draftUpdate(idx, updates);
                        }}
                        className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="entry">受付</option>
                        <option value="table_game">テーブルゲーム</option>
                        <option value="whole_game">全体ゲーム</option>
                        <option value="break">歓談</option>
                        <option value="result">結果発表</option>
                        <option value="end">閉会</option>
                      </select>
                    </div>
                  </div>
                  {/* ゲーム設定（ゲーム系のみ） */}
                  {(step.type === "table_game" || step.type === "whole_game") && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ゲームタイプ</label>
                        <select
                          value={step.gameType || ""}
                          onChange={(e) => draftUpdate(idx, { gameType: (e.target.value || undefined) as GameType | undefined })}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="">未設定</option>
                          <option value="value_match">価値観マッチ</option>
                          <option value="seno">せーの！</option>
                          <option value="streams">ストリームス</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">制限時間（秒）</label>
                        <input
                          type="number"
                          value={step.config?.timeLimit || ""}
                          onChange={(e) => draftUpdate(idx, { config: { timeLimit: Number(e.target.value) || undefined } })}
                          placeholder="30"
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                  {/* 入力プロンプト設定（台本編集モード） */}
                  <div className="mt-2">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={!!step.input}
                        onChange={(e) => {
                          if (e.target.checked) {
                            draftUpdate(idx, { input: { prompt: "", inputType: "text" } });
                          } else {
                            draftUpdate(idx, { input: undefined });
                          }
                        }}
                      />
                      入力プロンプト
                    </label>
                    {step.input && (
                      <div className="mt-1 ml-4 space-y-1">
                        <input
                          type="text"
                          value={step.input.prompt}
                          onChange={(e) => draftUpdate(idx, { input: { ...step.input!, prompt: e.target.value } })}
                          placeholder="例: 好きな食べ物は？"
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
                        />
                        <select
                          value={step.input.inputType}
                          onChange={(e) => {
                            const inputType = e.target.value as "text" | "number" | "select";
                            draftUpdate(idx, { input: { ...step.input!, inputType, options: inputType === "select" ? (step.input!.options || [""]) : undefined } });
                          }}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
                        >
                          <option value="text">テキスト</option>
                          <option value="number">数値</option>
                          <option value="select">選択肢</option>
                        </select>
                        {step.input.inputType === "select" && (
                          <textarea
                            value={(step.input.options || []).join("\n")}
                            onChange={(e) => draftUpdate(idx, { input: { ...step.input!, options: e.target.value.split("\n") } })}
                            placeholder={"選択肢1\n選択肢2"}
                            rows={2}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* 挿入ボタン（各ステップの後） */}
                <button
                  onClick={() => draftInsert(idx)}
                  className="w-full py-1 text-xs text-gray-600 hover:text-gray-400 transition"
                >
                  + ここに挿入
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={draftAppend}
            className="w-full py-2 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded text-sm transition mb-3"
          >
            + 末尾にステップを追加
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSaveScenario}
              disabled={scenarioDraft.some((s) => !s.label.trim())}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
            >
              保存
            </button>
            <button
              onClick={handleCancelScenario}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        /* ========== 進行モード ========== */
        <div>
          {/* 進行コントロール（スティッキー） */}
          <div className="sticky top-0 z-10 bg-gray-900 pb-2 -mx-4 px-4 pt-1 border-b border-gray-700 mb-4">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-gray-500">現在:</span>
              <span className="text-xs font-semibold text-white">
                Step {room.state.currentStep + 1} — {steps[room.state.currentStep]?.label}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {room.state.phase}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => goToPrevStep(roomId)}
                disabled={room.state.currentStep === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded transition"
              >
                ← 前へ
              </button>
              <button
                onClick={() => goToNextStep(roomId)}
                disabled={room.state.currentStep === (steps.length || 1) - 1}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition"
              >
                次へ →
              </button>
              <button
                onClick={() => setShowInterrupt(!showInterrupt)}
                className={`px-3 py-2 rounded text-sm transition ${showInterrupt ? "bg-yellow-600 hover:bg-yellow-700" : "bg-yellow-700/50 hover:bg-yellow-700 text-yellow-300"}`}
              >
                割り込み
              </button>
            </div>
          </div>

          {/* ステップ一覧 */}
          <div className="space-y-2 mb-6">
            {steps.map((step, index) => {
              const isExpanded = expandedStep === index;
              const isEditing = editingStep === index;
              const draft = isEditing ? stepDraft : null;

              return (
                <div key={index}>
                  {/* ステップヘッダー */}
                  <div
                    onClick={() => {
                      if (isEditing) return;
                      setExpandedStep(isExpanded ? null : index);
                    }}
                    className={`p-3 rounded border cursor-pointer transition ${
                      index === room.state.currentStep
                        ? "border-blue-500 bg-blue-900/30"
                        : index < room.state.currentStep
                        ? "border-gray-700 bg-gray-800/50 opacity-60"
                        : "border-gray-700 bg-gray-800/30 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Step {index + 1}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          step.type === "table_game"
                            ? "bg-green-900 text-green-300"
                            : step.type === "whole_game"
                            ? "bg-purple-900 text-purple-300"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {stepTypeLabel(step.type)}
                      </span>
                      {step.gameType && (
                        <span className="text-xs text-gray-400">{step.gameType}</span>
                      )}
                      <span className="ml-auto text-xs text-gray-600">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                    <p className="font-medium mt-1">{step.label}</p>
                  </div>

                  {/* 展開パネル */}
                  {isExpanded && (
                    <div className="ml-2 mt-1 p-3 bg-gray-800/50 rounded border-l-2 border-gray-600 space-y-3">
                      {isEditing && draft ? (
                        /* --- 個別編集フォーム --- */
                        <StepEditForm
                          draft={draft}
                          updateDraft={updateStepDraft}
                          room={room}
                          onSave={handleSaveStepEdit}
                          onCancel={handleCancelStepEdit}
                        />
                      ) : (
                        /* --- 読み取り表示 --- */
                        <>
                          <StepDetailView step={step} room={room} players={players} />

                          {/* ゲーム操作（現在ステップ かつ ゲーム系） */}
                          {index === room.state.currentStep &&
                            (step.type === "table_game" || step.type === "whole_game") && (
                              <GameControls
                                roomId={roomId}
                                room={room}
                                step={step}
                                questionText={questionText}
                                setQuestionText={setQuestionText}
                              />
                            )}

                          {/* 参加者への表示 */}
                          <div className="border-t border-gray-700 pt-2">
                            <p className="text-xs text-gray-500 mb-1 font-semibold">参加者への表示</p>
                            <p className="text-sm text-gray-300 mb-1">
                              <span className="text-gray-500">メッセージ: </span>
                              {step.display?.message || <span className="text-gray-600">{getDefaultMessage(step)}</span>}
                            </p>
                            {step.display?.showTablemates && (
                              <p className="text-xs text-green-400 mb-1">テーブルメイト表示: ON</p>
                            )}
                            {step.display?.showFields && step.display.showFields.length > 0 && (
                              <p className="text-xs text-gray-400">
                                表示フィールド: {step.display.showFields.map((fid) => {
                                  const f = room.config.entryFields?.find((ef) => ef.id === fid);
                                  return f?.label || fid;
                                }).join(", ")}
                              </p>
                            )}
                            {step.input && (
                              <p className="text-xs text-purple-400 mt-1">
                                入力プロンプト: 「{step.input.prompt}」（{step.input.inputType}）
                              </p>
                            )}
                          </div>

                          {/* 回答閲覧・開示パネル */}
                          {step.input && (
                            <StepResponsesPanel
                              roomId={roomId}
                              stepIndex={index}
                              step={step}
                              room={room}
                            />
                          )}

                          {/* 編集ボタン */}
                          <button
                            onClick={() => handleStartStepEdit(index)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition"
                          >
                            このステップを編集
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* 割り込みフォーム（現在ステップの直下に表示） */}
                  {index === room.state.currentStep && showInterrupt && (
                    <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg space-y-2">
                      <p className="text-xs font-semibold text-yellow-400">割り込みステップ挿入（Step {room.state.currentStep + 1} の後に追加）</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">ラベル</label>
                          <input
                            type="text"
                            value={interruptLabel}
                            onChange={(e) => setInterruptLabel(e.target.value)}
                            placeholder="ステップ名"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">タイプ</label>
                          <select
                            value={interruptType}
                            onChange={(e) => setInterruptType(e.target.value as StepType)}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
                          >
                            <option value="break">歓談</option>
                            <option value="entry">受付</option>
                            <option value="table_game">テーブルゲーム</option>
                            <option value="whole_game">全体ゲーム</option>
                            <option value="result">結果発表</option>
                            <option value="end">閉会</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">メッセージ（任意）</label>
                        <input
                          type="text"
                          value={interruptMessage}
                          onChange={(e) => setInterruptMessage(e.target.value)}
                          placeholder="参加者に表示するメッセージ"
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-400">
                        <input
                          type="checkbox"
                          checked={interruptAutoAdvance}
                          onChange={(e) => setInterruptAutoAdvance(e.target.checked)}
                        />
                        挿入後すぐに進む
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={handleInsertInterrupt}
                          disabled={!interruptLabel.trim()}
                          className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
                        >
                          挿入
                        </button>
                        <button
                          onClick={() => setShowInterrupt(false)}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* メッセージ送信 */}
          <MessageSender roomId={roomId} room={room} players={players} />

          {/* ツールセクション */}
          <div className="border-t border-gray-700 pt-4 mt-3">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">ツール</h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleShuffleTables}
                disabled={!players || Object.values(players).filter((p) => p.tableNumber > 0).length === 0}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm transition"
              >
                テーブルシャッフル
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ========== ゲーム操作パネル ==========

function GameControls({
  roomId,
  room,
  step,
  questionText,
  setQuestionText,
}: {
  roomId: string;
  room: Room;
  step: ScenarioStep;
  questionText: string;
  setQuestionText: (v: string) => void;
}) {
  return (
    <div className="border-t border-gray-700 pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-2">ゲーム操作</p>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="お題を入力..."
          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => {
            if (questionText.trim()) {
              sendQuestion(roomId, questionText.trim(), step.config?.timeLimit || 30);
              setQuestionText("");
            }
          }}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition"
        >
          送出
        </button>
      </div>
      {room.currentGame?.question && (
        <div className="bg-gray-800 p-2 rounded mb-2 text-sm">
          <span className="text-gray-400">お題: </span>
          <span className="font-medium">{room.currentGame.question.text}</span>
          <span className={`ml-2 text-xs font-semibold ${
            room.currentGame.question.status === "open" ? "text-green-400"
            : room.currentGame.question.status === "closed" ? "text-yellow-400"
            : "text-blue-400"
          }`}>
            [{room.currentGame.question.status}]
          </span>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setPhase(roomId, "playing")} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition">回答受付開始</button>
        <button onClick={() => closeQuestion(roomId)} className="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-xs transition">回答締切</button>
        <button onClick={() => revealAnswers(roomId)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition">結果公開</button>
      </div>
    </div>
  );
}

// ========== ステップ詳細（読み取り専用） ==========

function StepDetailView({
  step,
  room,
  players,
}: {
  step: ScenarioStep;
  room: Room;
  players: Record<string, Player> | null;
}) {
  switch (step.type) {
    case "entry":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">受付</h4>
          <div className="text-sm space-y-1">
            <p className="text-gray-400">
              参加者数: <span className="text-white font-semibold">{players ? Object.keys(players).length : 0}人</span>
            </p>
            <p className="text-gray-400">
              未割当: <span className="text-yellow-400 font-semibold">{players ? Object.values(players).filter((p) => p.tableNumber === 0).length : 0}人</span>
            </p>
          </div>
        </div>
      );
    case "table_game":
    case "whole_game":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-2">
            {step.type === "table_game" ? "テーブルゲーム" : "全体ゲーム"}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-gray-400">
              ゲーム: <span className="text-white">{
                step.gameType === "value_match" ? "価値観マッチ"
                : step.gameType === "seno" ? "せーの！"
                : step.gameType === "streams" ? "ストリームス"
                : "未設定"
              }</span>
            </p>
            {step.config?.timeLimit && (
              <p className="text-gray-400">
                制限: <span className="text-white">{step.config.timeLimit}秒</span>
              </p>
            )}
          </div>
        </div>
      );
    case "break":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">歓談タイム</h4>
          <p className="text-xs text-gray-500">参加者は自由に歓談中です</p>
        </div>
      );
    case "result":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">結果発表</h4>
          <p className="text-xs text-gray-500">スコア集計・ランキング表示（将来実装）</p>
        </div>
      );
    case "end":
      return (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 mb-1">閉会</h4>
          <p className="text-xs text-gray-500">参加者に閉会メッセージを表示します</p>
        </div>
      );
    default:
      return null;
  }
}

// ========== ステップ個別編集フォーム ==========

function StepEditForm({
  draft,
  updateDraft,
  room,
  onSave,
  onCancel,
}: {
  draft: ScenarioStep;
  updateDraft: (updates: Partial<ScenarioStep>) => void;
  room: Room;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* 基本設定 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ラベル</label>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => updateDraft({ label: e.target.value })}
            placeholder="ステップ名"
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">タイプ</label>
          <select
            value={draft.type}
            onChange={(e) => {
              const newType = e.target.value as StepType;
              const updates: Partial<ScenarioStep> = { type: newType };
              if (newType !== "table_game" && newType !== "whole_game") {
                updates.gameType = undefined;
                updates.config = undefined;
              }
              updateDraft(updates);
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="entry">受付</option>
            <option value="table_game">テーブルゲーム</option>
            <option value="whole_game">全体ゲーム</option>
            <option value="break">歓談</option>
            <option value="result">結果発表</option>
            <option value="end">閉会</option>
          </select>
        </div>
      </div>

      {/* タイプ別設定 */}
      {draft.type === "entry" && (
        <p className="text-xs text-gray-600">テーブル番号は自動表示されます</p>
      )}

      {(draft.type === "table_game" || draft.type === "whole_game") && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ゲームタイプ</label>
            <select
              value={draft.gameType || ""}
              onChange={(e) => updateDraft({ gameType: (e.target.value || undefined) as GameType | undefined })}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">未設定</option>
              <option value="value_match">価値観マッチ</option>
              <option value="seno">せーの！</option>
              <option value="streams">ストリームス</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">制限時間（秒）</label>
            <input
              type="number"
              value={draft.config?.timeLimit || ""}
              onChange={(e) => updateDraft({ config: { timeLimit: Number(e.target.value) || undefined } })}
              placeholder="30"
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* 参加者表示設定 */}
      <div className="border-t border-gray-700 pt-2 space-y-2">
        <p className="text-xs text-gray-400 font-semibold">参加者への表示</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">メッセージ（{"{tableNumber}"} {"{name}"} で置換可）</label>
          <textarea
            value={draft.display?.message || ""}
            onChange={(e) => updateDraft({ display: { ...draft.display, message: e.target.value || undefined } })}
            placeholder={`未設定時: ${getDefaultMessage(draft)}`}
            rows={2}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={draft.display?.showTablemates || false}
            onChange={(e) => updateDraft({ display: { ...draft.display, showTablemates: e.target.checked } })}
          />
          テーブルメイトを表示
        </label>
        {(room.config.entryFields || []).filter((f) => f.id !== "name").length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">表示フィールド</p>
            <div className="flex flex-wrap gap-2">
              {(room.config.entryFields || []).filter((f) => f.id !== "name").map((field) => (
                <label key={field.id} className="flex items-center gap-1 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={(draft.display?.showFields || []).includes(field.id)}
                    onChange={(e) => {
                      const current = draft.display?.showFields || [];
                      const next = e.target.checked
                        ? [...current, field.id]
                        : current.filter((id) => id !== field.id);
                      updateDraft({ display: { ...draft.display, showFields: next.length > 0 ? next : undefined } });
                    }}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 入力プロンプト設定 */}
      <div className="border-t border-gray-700 pt-2 space-y-2">
        <label className="flex items-center gap-2 text-xs text-gray-400 font-semibold">
          <input
            type="checkbox"
            checked={!!draft.input}
            onChange={(e) => {
              if (e.target.checked) {
                updateDraft({ input: { prompt: "", inputType: "text" } });
              } else {
                updateDraft({ input: undefined });
              }
            }}
          />
          入力プロンプトを追加
        </label>
        {draft.input && (
          <div className="space-y-2 ml-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">プロンプト</label>
              <input
                type="text"
                value={draft.input.prompt}
                onChange={(e) => updateDraft({ input: { ...draft.input!, prompt: e.target.value } })}
                placeholder="例: 好きな食べ物は？"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">入力タイプ</label>
                <select
                  value={draft.input.inputType}
                  onChange={(e) => {
                    const inputType = e.target.value as "text" | "number" | "select";
                    updateDraft({ input: { ...draft.input!, inputType, options: inputType === "select" ? (draft.input!.options || [""]) : undefined } });
                  }}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="text">テキスト</option>
                  <option value="number">数値</option>
                  <option value="select">選択肢</option>
                </select>
              </div>
            </div>
            {draft.input.inputType === "select" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
                <textarea
                  value={(draft.input.options || []).join("\n")}
                  onChange={(e) => {
                    const options = e.target.value.split("\n");
                    updateDraft({ input: { ...draft.input!, options } });
                  }}
                  placeholder={"選択肢1\n選択肢2\n選択肢3"}
                  rows={3}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 保存/取消 */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={!draft.label.trim()}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
        >
          保存
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ========== ステップ回答閲覧・開示パネル ==========

function StepResponsesPanel({
  roomId,
  stepIndex,
  step,
  room,
}: {
  roomId: string;
  stepIndex: number;
  step: ScenarioStep;
  room: Room;
}) {
  const [responses, setResponses] = useState<Record<string, StepResponse> | null>(null);

  useEffect(() => {
    const unsub = subscribeToStepResponses(roomId, stepIndex, setResponses);
    return unsub;
  }, [roomId, stepIndex]);

  if (!step.input) return null;

  const responseList = responses ? Object.entries(responses) : [];
  const currentReveal = room.stepReveals?.[String(stepIndex)];

  const handleReveal = async (mode: RevealMode, target: "all" | "same_table") => {
    await setStepReveal(roomId, stepIndex, { mode, target });
  };

  const handleClearReveal = async () => {
    await clearStepReveal(roomId, stepIndex);
  };

  return (
    <div className="border-t border-gray-700 pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-2">
        入力回答 ({responseList.length}件) — 「{step.input.prompt}」
      </p>

      {/* 回答一覧 */}
      {responseList.length > 0 ? (
        <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
          {responseList.map(([pid, resp]) => (
            <div key={pid} className="bg-gray-800 rounded px-2 py-1 text-xs flex justify-between">
              <span className="text-gray-400">{resp.playerName}（T{resp.tableNumber}）</span>
              <span className="text-white font-medium">{String(resp.value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600 mb-2">まだ回答がありません</p>
      )}

      {/* 開示コントロール */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">開示設定:</p>
        {currentReveal && (
          <p className="text-xs text-green-400">
            現在: {currentReveal.mode === "named" ? "名前付き" : currentReveal.mode === "anonymous" ? "匿名" : "管理者のみ"}
            （{currentReveal.target === "all" ? "全員" : "同テーブル"}）
          </p>
        )}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => handleReveal("named", "all")} className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs transition">名前付き（全員）</button>
          <button onClick={() => handleReveal("named", "same_table")} className="px-2 py-1 bg-green-700/70 hover:bg-green-600 rounded text-xs transition">名前付き（同テーブル）</button>
          <button onClick={() => handleReveal("anonymous", "all")} className="px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs transition">匿名（全員）</button>
          <button onClick={() => handleReveal("anonymous", "same_table")} className="px-2 py-1 bg-blue-700/70 hover:bg-blue-600 rounded text-xs transition">匿名（同テーブル）</button>
          <button onClick={() => handleReveal("admin_only", "all")} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition">管理者のみ</button>
          {currentReveal && (
            <button onClick={handleClearReveal} className="px-2 py-1 bg-red-700/50 hover:bg-red-700 rounded text-xs transition">開示解除</button>
          )}
        </div>
      </div>
    </div>
  );
}

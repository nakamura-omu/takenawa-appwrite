"use client";

import { useState, useRef, useCallback } from "react";
import { Room, Player, ScenarioStep } from "@/types/room";
import {
  goToNextStep,
  goToPrevStep,
  shuffleTables,
  halfShuffleTables,
  updateScenario,
  insertStepAfterCurrent,
} from "@/lib/room";
import MessageSender from "./MessageSender";
import GameControls from "./GameControls";
import StepDetailView from "./StepDetailView";
import StepEditForm from "./StepEditForm";
import ScenarioEditMode from "./ScenarioEditMode";
import InterruptForm from "./InterruptForm";
import StepTimer from "./StepTimer";
import { stepTypeLabel } from "./scenarioUtils";

export interface ScenarioPanelProps {
  roomId: string;
  room: Room;
  players: Record<string, Player> | null;
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

  // 現在ステップへのスクロール用
  const currentStepRef = useRef<HTMLDivElement>(null);
  const scrollToCurrentStep = useCallback(() => {
    currentStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // 割り込みステップ
  const [showInterrupt, setShowInterrupt] = useState(false);
  const [interruptDraft, setInterruptDraft] = useState<ScenarioStep>({ type: "break", label: "" });
  
  const steps = room.scenario?.steps || [];

  // === 個別ステップ編集（即時保存） ===

  const handleStartStepEdit = (index: number) => {
    setStepDraft({ ...steps[index] });
    setEditingStep(index);
    setExpandedStep(index);
  };

  const handleSaveStepEdit = async () => {
    if (editingStep === null || !stepDraft || !stepDraft.label.trim()) return;
    // 空のお題を除去
    const cleanedDraft = { ...stepDraft };
    if (cleanedDraft.config?.questions) {
      const filtered = cleanedDraft.config.questions
        .filter(q => q.text.trim())
        .map(q => ({
          ...q,
          options: q.inputType === "select" ? q.options?.filter(o => o.trim()) : undefined,
        }));
      cleanedDraft.config = {
        ...cleanedDraft.config,
        questions: filtered.length > 0 ? filtered : undefined,
      };
    }
    const newSteps = steps.map((s, i) => (i === editingStep ? cleanedDraft : s));
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
    // ステップのクリーンアップ（空のお題を除去、選択肢の空行除去）
    const cleanStep = (s: ScenarioStep): ScenarioStep => {
      const cleaned = { ...s };
      if (cleaned.config?.questions) {
        const filtered = cleaned.config.questions
          .filter(q => q.text.trim())
          .map(q => ({
            ...q,
            options: q.inputType === "select" ? q.options?.filter(o => o.trim()) : undefined,
          }));
        cleaned.config = {
          ...cleaned.config,
          questions: filtered.length > 0 ? filtered : undefined,
        };
      }
      return cleaned;
    };

    // ドラフトをそのまま保存（自動生成はしない。割り込み挿入時のみ自動生成）
    const processedSteps = scenarioDraft.map((step) => cleanStep(step));
    await updateScenario(roomId, processedSteps);
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

  // 完全席シャッフル
  const handleShuffleTables = async () => {
    if (!confirm("全員をランダムに再配分しますか？（全員席を立つ必要があります）")) return;
    await shuffleTables(roomId);
  };

  // 半数シャッフル
  const handleHalfShuffleTables = async () => {
    if (!confirm("各テーブルの約半数を抜き出して別テーブルへ移動させますか？")) return;
    await halfShuffleTables(roomId);
  };

  // 割り込みステップ挿入
  const handleInsertInterrupt = async () => {
    if (!interruptDraft.label.trim()) return;
    await insertStepAfterCurrent(roomId, interruptDraft, false);
    setShowInterrupt(false);
    setInterruptDraft({ type: "break", label: "" });
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
        <ScenarioEditMode
          scenarioDraft={scenarioDraft}
          draftUpdate={draftUpdate}
          draftMove={draftMove}
          draftRemove={draftRemove}
          draftInsert={draftInsert}
          draftAppend={draftAppend}
          setScenarioDraft={setScenarioDraft}
          onSave={handleSaveScenario}
          onCancel={handleCancelScenario}
          currentStep={room.state.currentStep}
        />
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
              <StepTimer
                stepTimestamp={room.state.stepTimestamps?.[`s${room.state.currentStep}`]}
                durationMinutes={steps[room.state.currentStep]?.durationMinutes}
              />
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
                onClick={scrollToCurrentStep}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded transition text-sm"
              >
                現在
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
                <div key={index} ref={index === room.state.currentStep ? currentStepRef : undefined}>
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
                            : step.type === "survey"
                            ? "bg-orange-900 text-orange-300"
                            : step.type === "survey_open"
                            ? "bg-amber-900 text-amber-300"
                            : step.type === "survey_result"
                            ? "bg-orange-900/70 text-orange-300"
                            : step.type === "participants"
                            ? "bg-cyan-900 text-cyan-300"
                            : step.type === "reveal"
                            ? "bg-pink-900 text-pink-300"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {stepTypeLabel(step.type)}
                      </span>
                      {step.gameType && (
                        <span className="text-xs text-gray-400">{step.gameType}</span>
                      )}
                      {step.durationMinutes && (
                        <span className="text-xs text-gray-500">{step.durationMinutes}分</span>
                      )}
                      {index === room.state.currentStep && (
                        <StepTimer
                          stepTimestamp={room.state.stepTimestamps?.[`s${index}`]}
                          durationMinutes={step.durationMinutes}
                        />
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
                          roomId={roomId}
                          draft={draft}
                          updateDraft={updateStepDraft}
                          room={room}
                          onSave={handleSaveStepEdit}
                          onCancel={handleCancelStepEdit}
                          stepIndex={index}
                        />
                      ) : (
                        /* --- 読み取り表示 --- */
                        <>
                          <StepDetailView roomId={roomId} stepIndex={index} step={step} room={room} players={players} />

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
                    <InterruptForm
                      currentStep={room.state.currentStep}
                      draft={interruptDraft}
                      updateDraft={(updates) => setInterruptDraft({ ...interruptDraft, ...updates })}
                      onInsert={handleInsertInterrupt}
                      onClose={() => setShowInterrupt(false)}
                    />
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
                完全席シャッフル
              </button>
              <button
                onClick={handleHalfShuffleTables}
                disabled={!players || Object.values(players).filter((p) => p.tableNumber > 0).length === 0 || (room.config.tableCount || 1) < 2}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm transition"
              >
                半数シャッフル
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

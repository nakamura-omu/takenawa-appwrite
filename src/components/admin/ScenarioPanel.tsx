"use client";

import { useState, useEffect } from "react";
import { Room, Player, ScenarioStep, StepType, GameType, GameQuestion, RevealDisplayType } from "@/types/room";
import { pickRandomQuestions } from "@/lib/questionBank";
import {
  goToNextStep,
  goToPrevStep,
  shuffleTables,
  updateScenario,
  insertStepAfterCurrent,
} from "@/lib/room";
import MessageSender from "./MessageSender";
import GameControls from "./GameControls";
import StepDetailView from "./StepDetailView";
import StepEditForm from "./StepEditForm";
import { getDefaultMessage, stepTypeLabel, INSERTABLE_STEP_TYPES } from "./scenarioUtils";

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

  // 割り込みステップ
  const [showInterrupt, setShowInterrupt] = useState(false);
  const [interruptLabel, setInterruptLabel] = useState("");
  const [interruptType, setInterruptType] = useState<StepType>("break");
  const [interruptMessage, setInterruptMessage] = useState("");
  
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

    // アンケート・ゲームステップの結果ステップを自動生成
    const processedSteps: ScenarioStep[] = [];
    scenarioDraft.forEach((step, idx) => {
      if (step.type === "survey" && step.survey) {
        // 質問ステップを追加
        const questionStep: ScenarioStep = {
          ...cleanStep(step),
          survey: {
            ...step.survey,
            resultStepIndex: processedSteps.length + 1, // 次のステップが結果
          },
        };
        processedSteps.push(questionStep);

        // 結果ステップを自動追加（reveal形式）
        const resultStep: ScenarioStep = {
          type: "reveal",
          label: `${step.label}（結果）`,
          reveal: {
            sourceStepIndex: processedSteps.length - 1,
            displayType: "bar_chart",
          },
        };
        processedSteps.push(resultStep);
      } else if (step.type === "survey_open" && step.survey) {
        processedSteps.push(cleanStep(step));

        // 次のステップが既にこの回答のreveal(list)なら追加しない
        const next = scenarioDraft[idx + 1];
        const alreadyHasResult = next?.type === "reveal"
          && next.reveal?.displayType === "list";
        if (!alreadyHasResult) {
          const resultStep: ScenarioStep = {
            type: "reveal",
            label: `${step.label}（結果）`,
            reveal: {
              sourceStepIndex: processedSteps.length - 1,
              displayType: "list",
            },
          };
          processedSteps.push(resultStep);
        }
      } else if (step.type === "table_game" || step.type === "whole_game") {
        processedSteps.push(cleanStep(step));

        // 次のステップが既にこのゲームのreveal(scoreboard)なら追加しない
        const next = scenarioDraft[idx + 1];
        const alreadyHasResult = next?.type === "reveal"
          && next.reveal?.displayType === "scoreboard";
        if (!alreadyHasResult) {
          const resultStep: ScenarioStep = {
            type: "reveal",
            label: `${step.label}（結果発表）`,
            reveal: {
              sourceStepIndex: processedSteps.length - 1,
              displayType: "scoreboard",
            },
          };
          processedSteps.push(resultStep);
        }
      } else if (step.type === "survey_result") {
        // 結果ステップは自動生成されるのでスキップ
        // （既存の結果ステップが残っている場合は除外）
      } else {
        processedSteps.push(cleanStep(step));
      }
    });

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
    await insertStepAfterCurrent(roomId, newStep, false);
    setShowInterrupt(false);
    setInterruptLabel("");
    setInterruptType("break");
    setInterruptMessage("");
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
                          </div>

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
                      interruptLabel={interruptLabel}
                      setInterruptLabel={setInterruptLabel}
                      interruptType={interruptType}
                      setInterruptType={setInterruptType}
                      interruptMessage={interruptMessage}
                      setInterruptMessage={setInterruptMessage}
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
                テーブルシャッフル
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ========== 台本編集モード ==========

interface ScenarioEditModeProps {
  scenarioDraft: ScenarioStep[];
  draftUpdate: (index: number, updates: Partial<ScenarioStep>) => void;
  draftMove: (index: number, direction: -1 | 1) => void;
  draftRemove: (index: number) => void;
  draftInsert: (afterIndex: number) => void;
  draftAppend: () => void;
  setScenarioDraft: (steps: ScenarioStep[]) => void;
  onSave: () => void;
  onCancel: () => void;
  currentStep: number;
}

function ScenarioEditMode({
  scenarioDraft,
  draftUpdate,
  draftMove,
  draftRemove,
  draftInsert,
  draftAppend,
  setScenarioDraft,
  onSave,
  onCancel,
  currentStep,
}: ScenarioEditModeProps) {
  return (
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
            <div className={`p-3 rounded border ${
              idx === currentStep
                ? "border-blue-500 bg-blue-900/30"
                : idx < currentStep
                ? "border-gray-700 bg-gray-800/50 opacity-60"
                : "border-gray-700 bg-gray-800"
            }`}>
              <div className="flex gap-1 items-center mb-2">
                <span className="text-xs text-gray-500 mr-1">Step {idx + 1}</span>
                <button onClick={() => draftMove(idx, -1)} disabled={idx === 0 || (idx === 1 && scenarioDraft[0]?.type === "entry")} className="px-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs">↑</button>
                <button onClick={() => draftMove(idx, 1)} disabled={idx === scenarioDraft.length - 1 || (idx === 0 && step.type === "entry")} className="px-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs">↓</button>
                <button onClick={() => draftRemove(idx)} disabled={idx === 0 && step.type === "entry"} className="ml-auto px-1 text-red-400 hover:text-red-300 text-xs disabled:opacity-30">削除</button>
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
                    disabled={idx === 0 && step.type === "entry"}
                    onChange={(e) => {
                      const newType = e.target.value as StepType;
                      const updates: Partial<ScenarioStep> = { type: newType };
                      if (newType !== "table_game" && newType !== "whole_game") {
                        updates.gameType = undefined;
                        updates.config = undefined;
                      }
                      if (newType !== "survey" && newType !== "survey_open" && newType !== "survey_result") {
                        updates.survey = undefined;
                      }
                      if (newType === "survey") {
                        updates.survey = { question: "", options: ["", ""] };
                      }
                      if (newType === "survey_open") {
                        updates.survey = { question: "", options: [] };
                      }
                      if (newType === "reveal") {
                        updates.reveal = { sourceStepIndex: 0, displayType: "list" };
                      }
                      if (newType !== "reveal") {
                        updates.reveal = undefined;
                      }
                      draftUpdate(idx, updates);
                    }}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {step.type === "entry" && <option value="entry">受付</option>}
                    {INSERTABLE_STEP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* 所要時間 */}
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">所要時間（分）</label>
                <input
                  type="number"
                  min="0"
                  value={step.durationMinutes || ""}
                  onChange={(e) => draftUpdate(idx, { durationMinutes: Number(e.target.value) || undefined })}
                  placeholder="例: 15"
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {/* ゲーム設定（ゲーム系のみ） */}
              {(step.type === "table_game" || step.type === "whole_game") && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ゲームタイプ</label>
                    <select
                      value={step.gameType || ""}
                      onChange={(e) => draftUpdate(idx, { gameType: (e.target.value || undefined) as GameType | undefined })}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">未設定</option>
                      <option value="tuning_gum">チューニングガム</option>
                      <option value="good_line">いい線行きましょう</option>
                      <option value="evens">みんなのイーブン</option>
                      <option value="krukkurin">くるっくりん</option>
                      <option value="meta_streams">メタストリームス</option>
                    </select>
                  </div>
                  {/* お題リスト */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">お題リスト（{(step.config?.questions || []).length}問）</label>
                    <div className="space-y-2">
                      {(step.config?.questions || []).map((q, qIdx) => (
                        <GameQuestionEditor
                          key={qIdx}
                          index={qIdx}
                          question={q}
                          onUpdate={(updated) => {
                            const questions = [...(step.config?.questions || [])];
                            questions[qIdx] = updated;
                            draftUpdate(idx, { config: { ...step.config, questions } });
                          }}
                          onRemove={() => {
                            const questions = (step.config?.questions || []).filter((_, i) => i !== qIdx);
                            draftUpdate(idx, { config: { ...step.config, questions: questions.length > 0 ? questions : undefined } });
                          }}
                        />
                      ))}
                      <button
                        onClick={() => {
                          const questions: GameQuestion[] = [...(step.config?.questions || []), { text: "", inputType: "text" }];
                          draftUpdate(idx, { config: { ...step.config, questions } });
                        }}
                        className="w-full py-1.5 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded text-xs transition"
                      >
                        + お題を追加
                      </button>
                      {step.gameType && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const preset = pickRandomQuestions(step.gameType!, 1);
                              draftUpdate(idx, { config: { ...step.config, questions: [...(step.config?.questions || []), ...preset] } });
                            }}
                            className="flex-1 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded text-xs font-semibold transition"
                          >
                            プリセット1問追加
                          </button>
                          <button
                            onClick={() => {
                              const preset = pickRandomQuestions(step.gameType!, 5);
                              draftUpdate(idx, { config: { ...step.config, questions: [...(step.config?.questions || []), ...preset] } });
                            }}
                            className="flex-1 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded text-xs font-semibold transition"
                          >
                            プリセット5問追加
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* アンケート設定 */}
              {step.type === "survey" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">質問文</label>
                    <input
                      type="text"
                      value={step.survey?.question || ""}
                      onChange={(e) => draftUpdate(idx, { survey: { ...step.survey!, question: e.target.value } })}
                      placeholder="例: 今日の宴会で楽しみなことは？"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
                    <textarea
                      value={(step.survey?.options || []).join("\n")}
                      onChange={(e) => {
                        const options = e.target.value.split("\n");
                        draftUpdate(idx, { survey: { ...step.survey!, options } });
                      }}
                      placeholder={"A. 美味しい料理\nB. 新しい出会い\nC. ゲーム"}
                      rows={4}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={step.survey?.allowMultiple || false}
                      onChange={(e) => draftUpdate(idx, { survey: { ...step.survey!, allowMultiple: e.target.checked } })}
                    />
                    複数選択を許可
                  </label>
                  <p className="text-xs text-blue-400">
                    ※ 保存時に結果表示ステップが自動追加されます
                  </p>
                </div>
              )}
              {/* アンケート回答（フリーテキスト） */}
              {step.type === "survey_open" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">質問文</label>
                    <input
                      type="text"
                      value={step.survey?.question || ""}
                      onChange={(e) => draftUpdate(idx, { survey: { ...step.survey!, question: e.target.value } })}
                      placeholder="例: 主催へのひとことをどうぞ！"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-blue-400">
                    ※ 保存時に結果表示ステップが自動追加されます（不要なら削除可）
                  </p>
                </div>
              )}
              {/* アンケート結果（読み取り専用） */}
              {step.type === "survey_result" && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">
                    このステップはアンケートの結果を表示します。
                    {step.survey?.questionStepIndex !== undefined && (
                      <span className="text-blue-400">（Step {step.survey.questionStepIndex + 1} の結果）</span>
                    )}
                  </p>
                </div>
              )}
              {/* 回答開示設定 */}
              {step.type === "reveal" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">参照ステップ</label>
                    <select
                      value={step.reveal?.sourceStepIndex ?? 0}
                      onChange={(e) => draftUpdate(idx, { reveal: { ...step.reveal!, sourceStepIndex: Number(e.target.value) } })}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    >
                      {scenarioDraft.map((s, i) => {
                        if (s.type !== "survey" && s.type !== "survey_open" && s.type !== "table_game" && s.type !== "whole_game") return null;
                        return (
                          <option key={i} value={i}>
                            Step {i + 1}: {s.label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">表示形式</label>
                    <select
                      value={step.reveal?.displayType || "list"}
                      onChange={(e) => draftUpdate(idx, { reveal: { ...step.reveal!, displayType: e.target.value as RevealDisplayType } })}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="list">一覧</option>
                      <option value="bar_chart">棒グラフ</option>
                      <option value="pie_chart">円グラフ</option>
                      <option value="scoreboard">スコアボード</option>
                    </select>
                  </div>
                </div>
              )}
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
      <div className="sticky bottom-0 bg-gray-900 pt-2 pb-1 -mx-4 px-4 border-t border-gray-700 flex gap-2">
        <button
          onClick={onSave}
          disabled={scenarioDraft.some((s) => !s.label.trim())}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
        >
          保存
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ========== ステップタイマー ==========

function StepTimer({ stepTimestamp, durationMinutes }: { stepTimestamp?: number; durationMinutes?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!stepTimestamp) return;
    const update = () => setElapsed(Math.floor((Date.now() - stepTimestamp) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [stepTimestamp]);

  if (!stepTimestamp) return null;

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const elapsedStr = `${elapsedMin}:${String(elapsedSec).padStart(2, "0")}`;

  if (!durationMinutes) {
    return (
      <span className="ml-2 text-xs text-gray-400 tabular-nums">
        {elapsedStr}
      </span>
    );
  }

  const targetSec = durationMinutes * 60;
  const overTime = elapsed > targetSec;
  const overSec = elapsed - targetSec;
  const overMin = Math.floor(overSec / 60);

  return (
    <span className={`ml-2 text-xs tabular-nums font-medium ${overTime ? "text-red-400" : "text-green-400"}`}>
      {elapsedStr} / {durationMinutes}:00
      {overTime && ` (+${overMin}:${String(overSec % 60).padStart(2, "0")})`}
    </span>
  );
}

// ========== 割り込みフォーム ==========

interface InterruptFormProps {
  currentStep: number;
  interruptLabel: string;
  setInterruptLabel: (v: string) => void;
  interruptType: StepType;
  setInterruptType: (v: StepType) => void;
  interruptMessage: string;
  setInterruptMessage: (v: string) => void;
  onInsert: () => void;
  onClose: () => void;
}

function InterruptForm({
  currentStep,
  interruptLabel,
  setInterruptLabel,
  interruptType,
  setInterruptType,
  interruptMessage,
  setInterruptMessage,
  onInsert,
  onClose,
}: InterruptFormProps) {
  return (
    <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-yellow-400">割り込みステップ挿入（Step {currentStep + 1} の後に追加）</p>
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
            {INSERTABLE_STEP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
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
      <div className="flex gap-2">
        <button
          onClick={onInsert}
          disabled={!interruptLabel.trim()}
          className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded text-sm font-semibold transition"
        >
          挿入
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

// ========== お題エディター ==========

interface GameQuestionEditorProps {
  index: number;
  question: GameQuestion;
  onUpdate: (updated: GameQuestion) => void;
  onRemove: () => void;
}

function GameQuestionEditor({ index, question, onUpdate, onRemove }: GameQuestionEditorProps) {
  return (
    <div className="bg-gray-800 p-2 rounded border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500">お題 {index + 1}</span>
        <button
          onClick={onRemove}
          className="ml-auto text-xs text-red-400 hover:text-red-300 transition"
        >
          削除
        </button>
      </div>
      <input
        type="text"
        value={question.text}
        onChange={(e) => onUpdate({ ...question, text: e.target.value })}
        placeholder="お題を入力..."
        className="w-full px-2 py-1 mb-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">回答方法:</label>
        <select
          value={question.inputType}
          onChange={(e) => {
            const inputType = e.target.value as "text" | "number" | "select";
            onUpdate({
              ...question,
              inputType,
              options: inputType === "select" ? (question.options || ["", ""]) : undefined,
            });
          }}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
        >
          <option value="text">テキスト</option>
          <option value="number">数値</option>
          <option value="select">選択肢</option>
        </select>
      </div>
      {question.inputType === "select" && (
        <div className="mt-2">
          <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
          <textarea
            value={(question.options || []).join("\n")}
            onChange={(e) => onUpdate({ ...question, options: e.target.value.split("\n") })}
            placeholder={"選択肢1\n選択肢2"}
            rows={2}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      )}
    </div>
  );
}

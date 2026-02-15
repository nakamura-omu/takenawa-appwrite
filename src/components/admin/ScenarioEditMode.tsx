"use client";

import { ScenarioStep, StepType, GameType, GameQuestion, RevealDisplayType, AnswerRevealScope } from "@/types/room";
import { pickRandomQuestions } from "@/lib/questionBank";
import { INSERTABLE_STEP_TYPES } from "./scenarioUtils";
import GameQuestionEditor from "./GameQuestionEditor";

export interface ScenarioEditModeProps {
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

export default function ScenarioEditMode({
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
                        // 直前のゲーム/アンケートステップを自動参照
                        let defaultSource = 0;
                        let defaultDisplay: RevealDisplayType = "list";
                        for (let i = idx - 1; i >= 0; i--) {
                          const t = scenarioDraft[i]?.type;
                          if (t === "table_game" || t === "whole_game") {
                            defaultSource = i;
                            defaultDisplay = "scoreboard";
                            break;
                          }
                          if (t === "survey" || t === "survey_open") {
                            defaultSource = i;
                            defaultDisplay = "bar_chart";
                            break;
                          }
                        }
                        updates.reveal = { sourceStepIndex: defaultSource, displayType: defaultDisplay };
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
              {/* アナウンスメッセージ */}
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">アナウンスメッセージ</label>
                <textarea
                  value={step.display?.message || ""}
                  onChange={(e) => draftUpdate(idx, {
                    display: { ...step.display, message: e.target.value || undefined }
                  })}
                  placeholder="例: チューニングガムの時間です！"
                  rows={2}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
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
              {step.type === "reveal" && (() => {
                const validSourceTypes = ["survey", "survey_open", "table_game", "whole_game"];
                const rawSrcIdx = step.reveal?.sourceStepIndex ?? 0;
                const srcIdx = validSourceTypes.includes(scenarioDraft[rawSrcIdx]?.type)
                  ? rawSrcIdx
                  : scenarioDraft.findIndex(s => validSourceTypes.includes(s.type));
                const srcStep = srcIdx >= 0 ? scenarioDraft[srcIdx] : undefined;
                const srcType = srcStep?.type;
                const isGame = srcType === "table_game" || srcType === "whole_game";
                const isSurveyChoice = srcType === "survey";
                const displayOptions: { value: RevealDisplayType; label: string }[] = [
                  { value: "list", label: "一覧" },
                  ...(isGame || isSurveyChoice ? [
                    { value: "bar_chart" as RevealDisplayType, label: "棒グラフ" },
                    { value: "pie_chart" as RevealDisplayType, label: "円グラフ" },
                  ] : []),
                  ...(isGame ? [
                    { value: "scoreboard" as RevealDisplayType, label: "スコアボード" },
                  ] : []),
                  { value: "per_question" as RevealDisplayType, label: isGame ? "個別お題開示" : "個別回答開示" },
                ];
                return (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">参照ステップ</label>
                    <select
                      value={srcIdx}
                      onChange={(e) => {
                        const newIdx = Number(e.target.value);
                        const newSrc = scenarioDraft[newIdx];
                        const newIsGame = newSrc?.type === "table_game" || newSrc?.type === "whole_game";
                        const newIsSurveyChoice = newSrc?.type === "survey";
                        const cur = step.reveal?.displayType || "list";
                        let newDisplay = cur;
                        if (cur === "scoreboard" && !newIsGame) newDisplay = "list";
                        if ((cur === "bar_chart" || cur === "pie_chart") && !newIsGame && !newIsSurveyChoice) newDisplay = "list";
                        draftUpdate(idx, { reveal: { ...step.reveal!, sourceStepIndex: newIdx, displayType: newDisplay } });
                      }}
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
                      {displayOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">回答範囲</label>
                    <select
                      value={step.reveal?.scope?.type || "all"}
                      onChange={(e) => {
                        const scopeType = e.target.value as "all" | "table";
                        const scope: AnswerRevealScope = scopeType === "table" ? { type: "table" } : { type: "all" };
                        draftUpdate(idx, { reveal: { ...step.reveal!, scope } });
                      }}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">全体</option>
                      <option value="table">同じテーブル</option>
                    </select>
                  </div>
                </div>
                );
              })()}
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

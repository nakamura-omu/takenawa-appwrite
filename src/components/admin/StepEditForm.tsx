"use client";

import { Room, ScenarioStep, StepType, GameType, GameQuestion, RevealConfig, RevealDisplayType, AnswerRevealScope } from "@/types/room";
import { INSERTABLE_STEP_TYPES } from "./scenarioUtils";
import EntryFieldsEditor from "./EntryFieldsEditor";
import { pickRandomQuestions } from "@/lib/questionBank";
import GameQuestionEditor from "./GameQuestionEditor";

export interface StepEditFormProps {
  roomId: string;
  draft: ScenarioStep;
  updateDraft: (updates: Partial<ScenarioStep>) => void;
  room: Room;
  onSave: () => void;
  onCancel: () => void;
  stepIndex?: number;
}

export default function StepEditForm({
  roomId,
  draft,
  updateDraft,
  room,
  onSave,
  onCancel,
  stepIndex,
}: StepEditFormProps) {
  const isEntryLocked = stepIndex === 0 && draft.type === "entry";
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
            disabled={isEntryLocked}
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
                const steps = room.scenario?.steps || [];
                const myIdx = stepIndex ?? steps.length;
                let defaultSource = 0;
                let defaultDisplay: RevealDisplayType = "list";
                for (let i = myIdx - 1; i >= 0; i--) {
                  const t = steps[i]?.type;
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
              updateDraft(updates);
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            {draft.type === "entry" && <option value="entry">受付</option>}
            {INSERTABLE_STEP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 所要時間 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">所要時間（分）</label>
        <input
          type="number"
          min="0"
          value={draft.durationMinutes || ""}
          onChange={(e) => updateDraft({ durationMinutes: Number(e.target.value) || undefined })}
          placeholder="例: 15"
          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* アナウンスメッセージ */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">アナウンスメッセージ</label>
        <textarea
          value={draft.display?.message || ""}
          onChange={(e) => updateDraft({
            display: { ...draft.display, message: e.target.value || undefined }
          })}
          placeholder="例: チューニングガムの時間です！"
          rows={2}
          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {/* タイプ別設定 */}
      {draft.type === "entry" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">テーブル番号は自動表示されます</p>
          <div className="border border-gray-700 rounded p-2">
            <EntryFieldsEditor
              roomId={roomId}
              fields={room.config.entryFields || []}
              compact
            />
          </div>
        </div>
      )}

      {(draft.type === "table_game" || draft.type === "whole_game") && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ゲームタイプ</label>
            <select
              value={draft.gameType || ""}
              onChange={(e) => updateDraft({ gameType: (e.target.value || undefined) as GameType | undefined })}
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
            <label className="block text-xs text-gray-500 mb-2">お題リスト（{(draft.config?.questions || []).length}問）</label>
            <div className="space-y-2">
              {(draft.config?.questions || []).map((q, qIdx) => (
                <GameQuestionEditor
                  key={qIdx}
                  index={qIdx}
                  question={q}
                  onUpdate={(updated) => {
                    const questions = [...(draft.config?.questions || [])];
                    questions[qIdx] = updated;
                    updateDraft({ config: { ...draft.config, questions } });
                  }}
                  onRemove={() => {
                    const questions = (draft.config?.questions || []).filter((_, i) => i !== qIdx);
                    updateDraft({ config: { ...draft.config, questions: questions.length > 0 ? questions : undefined } });
                  }}
                />
              ))}
              <button
                onClick={() => {
                  const questions: GameQuestion[] = [...(draft.config?.questions || []), { text: "", inputType: "text" }];
                  updateDraft({ config: { ...draft.config, questions } });
                }}
                className="w-full py-1.5 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded text-xs transition"
              >
                + お題を追加
              </button>
              {draft.gameType && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const preset = pickRandomQuestions(draft.gameType!, 1);
                      updateDraft({ config: { ...draft.config, questions: [...(draft.config?.questions || []), ...preset] } });
                    }}
                    className="flex-1 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded text-xs font-semibold transition"
                  >
                    プリセット1問追加
                  </button>
                  <button
                    onClick={() => {
                      const preset = pickRandomQuestions(draft.gameType!, 5);
                      updateDraft({ config: { ...draft.config, questions: [...(draft.config?.questions || []), ...preset] } });
                    }}
                    className="flex-1 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded text-xs font-semibold transition"
                  >
                    プリセット5問追加
                  </button>
                </div>
              )}
              {/* テーブル自動進行の案内 */}
              {draft.type === "table_game" && (draft.config?.questions || []).filter(q => q?.text?.trim()).length > 0 && (
                <div className="p-2 bg-cyan-900/20 border border-cyan-700/30 rounded">
                  <p className="text-xs text-cyan-400">
                    お題が設定済みのテーブルゲームでは、ゲーム開始時に「テーブル自動進行」を選択できます。
                    各テーブルの全員が回答すると自動で次の問題へ進みます。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* アンケート設定 */}
      {draft.type === "survey" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">質問文</label>
            <input
              type="text"
              value={draft.survey?.question || ""}
              onChange={(e) => updateDraft({ survey: { ...draft.survey!, question: e.target.value } })}
              placeholder="例: 今日の宴会で楽しみなことは？"
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
            <textarea
              value={(draft.survey?.options || []).join("\n")}
              onChange={(e) => {
                const options = e.target.value.split("\n");
                updateDraft({ survey: { ...draft.survey!, options } });
              }}
              placeholder={"A. 美味しい料理\nB. 新しい出会い\nC. ゲーム"}
              rows={4}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={draft.survey?.allowMultiple || false}
              onChange={(e) => updateDraft({ survey: { ...draft.survey!, allowMultiple: e.target.checked } })}
            />
            複数選択を許可
          </label>
        </div>
      )}

      {/* アンケート結果（読み取り専用） */}
      {draft.type === "survey_result" && (
        <div>
          <p className="text-xs text-gray-500">
            このステップはアンケートの結果を表示します。
            {draft.survey?.questionStepIndex !== undefined && (
              <span className="text-blue-400">（Step {draft.survey.questionStepIndex + 1} の結果）</span>
            )}
          </p>
        </div>
      )}

      {/* アンケート回答（フリーテキスト）設定 */}
      {draft.type === "survey_open" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">質問文</label>
            <input
              type="text"
              value={draft.survey?.question || ""}
              onChange={(e) => updateDraft({ survey: { ...draft.survey!, question: e.target.value } })}
              placeholder="例: 主催へのひとことをどうぞ！"
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* 回答開示設定 */}
      {draft.type === "reveal" && (() => {
        const steps = room.scenario?.steps || [];
        const validSourceTypes = ["survey", "survey_open", "table_game", "whole_game"];
        const rawSrcIdx = draft.reveal?.sourceStepIndex ?? 0;
        // sourceStepIndex が有効なソース（ゲーム/アンケート）を指しているか確認、指していなければ最初の有効ステップにフォールバック
        const srcIdx = validSourceTypes.includes(steps[rawSrcIdx]?.type)
          ? rawSrcIdx
          : steps.findIndex(s => validSourceTypes.includes(s.type));
        const srcStep = srcIdx >= 0 ? steps[srcIdx] : undefined;
        const srcType = srcStep?.type;
        const isGame = srcType === "table_game" || srcType === "whole_game";
        const isSurveyChoice = srcType === "survey";
        // 参照先に応じた表示形式メニュー
        const displayOptions: { value: RevealDisplayType; label: string }[] = [
          { value: "list", label: "一覧" },
          ...(isGame || isSurveyChoice ? [
            { value: "bar_chart" as RevealDisplayType, label: "棒グラフ" },
            { value: "pie_chart" as RevealDisplayType, label: "円グラフ" },
          ] : []),
          ...(isGame ? [
            { value: "scoreboard" as RevealDisplayType, label: "スコアボード" },
          ] : []),
          { value: "per_question", label: isGame ? "個別お題開示" : "個別回答開示" },
        ];

        return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">参照ステップ</label>
            <select
              value={srcIdx}
              onChange={(e) => {
                const newIdx = Number(e.target.value);
                const newSrc = room.scenario?.steps?.[newIdx];
                const newIsGame = newSrc?.type === "table_game" || newSrc?.type === "whole_game";
                const newIsSurveyChoice = newSrc?.type === "survey";
                // 現在の displayType が新しい参照先で使えるか判定、ダメならデフォルトに
                const cur = draft.reveal?.displayType || "list";
                let newDisplay = cur;
                if (cur === "scoreboard" && !newIsGame) newDisplay = "list";
                if ((cur === "bar_chart" || cur === "pie_chart") && !newIsGame && !newIsSurveyChoice) newDisplay = "list";
                updateDraft({ reveal: { ...draft.reveal!, sourceStepIndex: newIdx, displayType: newDisplay } });
              }}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
            >
              {(room.scenario?.steps || []).map((s, i) => {
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
              value={draft.reveal?.displayType || "list"}
              onChange={(e) => updateDraft({ reveal: { ...draft.reveal!, displayType: e.target.value as RevealDisplayType } })}
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
              value={draft.reveal?.scope?.type || "all"}
              onChange={(e) => {
                const scopeType = e.target.value as "all" | "table";
                const scope: AnswerRevealScope = scopeType === "table" ? { type: "table" } : { type: "all" };
                updateDraft({ reveal: { ...draft.reveal!, scope } });
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

"use client";

import { ScenarioStep, StepType, GameType } from "@/types/room";
import { INSERTABLE_STEP_TYPES } from "./scenarioUtils";

export interface InterruptFormProps {
  currentStep: number;
  draft: ScenarioStep;
  updateDraft: (updates: Partial<ScenarioStep>) => void;
  onInsert: () => void;
  onClose: () => void;
}

export default function InterruptForm({
  currentStep,
  draft,
  updateDraft,
  onInsert,
  onClose,
}: InterruptFormProps) {
  const handleTypeChange = (newType: StepType) => {
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
    if (newType !== "reveal") {
      updates.reveal = undefined;
    }
    updateDraft(updates);
  };

  return (
    <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-yellow-400">割り込みステップ挿入（Step {currentStep + 1} の後に追加）</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ラベル</label>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => updateDraft({ label: e.target.value })}
            placeholder="ステップ名"
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">タイプ</label>
          <select
            value={draft.type}
            onChange={(e) => handleTypeChange(e.target.value as StepType)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
          >
            {INSERTABLE_STEP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
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
          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500 resize-none"
        />
      </div>

      {/* ゲーム設定 */}
      {(draft.type === "table_game" || draft.type === "whole_game") && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">ゲームタイプ</label>
          <select
            value={draft.gameType || ""}
            onChange={(e) => updateDraft({ gameType: (e.target.value || undefined) as GameType | undefined })}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
          >
            <option value="">未設定</option>
            <option value="tuning_gum">チューニングガム</option>
            <option value="good_line">いい線行きましょう</option>
            <option value="evens">みんなのイーブン</option>
            <option value="krukkurin">くるっくりん</option>
            <option value="meta_streams">メタストリームス</option>
          </select>
        </div>
      )}

      {/* アンケート集計設定 */}
      {draft.type === "survey" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">質問文</label>
            <input
              type="text"
              value={draft.survey?.question || ""}
              onChange={(e) => updateDraft({ survey: { ...draft.survey!, question: e.target.value } })}
              placeholder="例: 今日の宴会で楽しみなことは？"
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
            <textarea
              value={(draft.survey?.options || []).join("\n")}
              onChange={(e) => updateDraft({ survey: { ...draft.survey!, options: e.target.value.split("\n") } })}
              placeholder={"A. 美味しい料理\nB. 新しい出会い\nC. ゲーム"}
              rows={3}
              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500 resize-none"
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

      {/* アンケート回答依頼設定 */}
      {draft.type === "survey_open" && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">質問文</label>
          <input
            type="text"
            value={draft.survey?.question || ""}
            onChange={(e) => updateDraft({ survey: { ...draft.survey!, question: e.target.value } })}
            placeholder="例: 主催へのひとことをどうぞ！"
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-yellow-500"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onInsert}
          disabled={!draft.label.trim()}
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

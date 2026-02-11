"use client";

import { Room, ScenarioStep, StepType, GameType, GameQuestion } from "@/types/room";
import { getDefaultMessage } from "./scenarioUtils";
import EntryFieldsEditor from "./EntryFieldsEditor";

export interface StepEditFormProps {
  roomId: string;
  draft: ScenarioStep;
  updateDraft: (updates: Partial<ScenarioStep>) => void;
  room: Room;
  onSave: () => void;
  onCancel: () => void;
}

export default function StepEditForm({
  roomId,
  draft,
  updateDraft,
  room,
  onSave,
  onCancel,
}: StepEditFormProps) {
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
              if (newType !== "survey" && newType !== "survey_result") {
                updates.survey = undefined;
              }
              if (newType === "survey") {
                updates.survey = { question: "", options: ["", ""] };
              }
              updateDraft(updates);
            }}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="entry">受付</option>
            <option value="table_game">テーブルゲーム</option>
            <option value="whole_game">全体ゲーム</option>
            <option value="break">歓談</option>
            <option value="survey">アンケート</option>
            <option value="survey_result">アンケート結果</option>
            <option value="result">結果発表</option>
            <option value="end">閉会</option>
          </select>
        </div>
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
                onChange={(e) => updateDraft({ config: { ...draft.config, timeLimit: Number(e.target.value) || undefined } })}
                placeholder="30"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
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

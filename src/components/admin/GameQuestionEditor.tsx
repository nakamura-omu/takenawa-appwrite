"use client";

import { GameQuestion } from "@/types/room";

export interface GameQuestionEditorProps {
  index: number;
  question: GameQuestion;
  onUpdate: (updated: GameQuestion) => void;
  onRemove: () => void;
}

export default function GameQuestionEditor({ index, question, onUpdate, onRemove }: GameQuestionEditorProps) {
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

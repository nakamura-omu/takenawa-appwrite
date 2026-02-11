"use client";

import { useState } from "react";
import { ScenarioStep, StepResponse } from "@/types/room";
import { submitStepResponse } from "@/lib/room";

interface SurveyInputProps {
  roomId: string;
  stepIndex: number;
  step: ScenarioStep;
  playerId: string;
  playerName: string;
  tableNumber: number;
  existingResponse?: StepResponse;
}

// アンケート回答入力フォーム
export function SurveyInput({
  roomId,
  stepIndex,
  step,
  playerId,
  playerName,
  tableNumber,
  existingResponse,
}: SurveyInputProps) {
  const survey = step.survey;
  if (!survey) return null;

  const { question, options, allowMultiple } = survey;

  // 既存回答をパース
  const parseExisting = (): string[] => {
    if (!existingResponse) return [];
    const val = existingResponse.value;
    if (allowMultiple && typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [val];
      }
    }
    return [String(val)];
  };

  const [selected, setSelected] = useState<string[]>(parseExisting);
  const [submitted, setSubmitted] = useState(!!existingResponse);
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = (option: string) => {
    if (submitted) return;
    if (allowMultiple) {
      setSelected((prev) =>
        prev.includes(option)
          ? prev.filter((o) => o !== option)
          : [...prev, option]
      );
    } else {
      setSelected([option]);
    }
  };

  const handleSubmit = async () => {
    if (submitting || selected.length === 0) return;
    setSubmitting(true);

    // 複数選択の場合はJSON配列、単一選択の場合は文字列
    const value = allowMultiple ? JSON.stringify(selected) : selected[0];

    await submitStepResponse(roomId, stepIndex, playerId, value, playerName, tableNumber);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-300 mb-2">{question}</p>
        <p className="text-xs text-green-400">
          回答済み: {selected.join("、")}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4">
      <p className="text-sm font-medium text-gray-300 mb-3">{question}</p>

      {allowMultiple && (
        <p className="text-xs text-gray-500 mb-2">複数選択可</p>
      )}

      <div className="space-y-2 mb-4">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              onClick={() => handleToggle(option)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                isSelected
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-white bg-white"
                      : "border-gray-500"
                  }`}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  )}
                </div>
                <span className="text-sm">{option}</span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || selected.length === 0}
        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-sm font-semibold transition"
      >
        {submitting ? "送信中..." : "回答する"}
      </button>
    </div>
  );
}

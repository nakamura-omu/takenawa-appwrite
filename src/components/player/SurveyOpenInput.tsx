"use client";

import { useState } from "react";
import { ScenarioStep, StepResponse } from "@/types/room";
import { submitStepResponse } from "@/lib/room";

interface SurveyOpenInputProps {
  roomId: string;
  stepIndex: number;
  step: ScenarioStep;
  playerId: string;
  playerName: string;
  tableNumber: number;
  existingResponse?: StepResponse;
}

export function SurveyOpenInput({
  roomId,
  stepIndex,
  step,
  playerId,
  playerName,
  tableNumber,
  existingResponse,
}: SurveyOpenInputProps) {
  const question = step.survey?.question;
  if (!question) return null;

  const [text, setText] = useState(existingResponse ? String(existingResponse.value) : "");
  const [submitted, setSubmitted] = useState(!!existingResponse);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting || !text.trim()) return;
    setSubmitting(true);
    await submitStepResponse(roomId, stepIndex, playerId, text.trim(), playerName, tableNumber);
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-300 mb-2">{question}</p>
        <p className="text-xs text-green-400 mb-1">回答済み</p>
        <p className="text-sm text-white">{text}</p>
      </div>
    );
  }

  return (
    <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4">
      <p className="text-sm font-medium text-gray-300 mb-3">{question}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="回答を入力..."
        rows={3}
        className="w-full px-3 py-2 mb-3 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-purple-500 resize-none text-sm"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting || !text.trim()}
        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-sm font-semibold transition"
      >
        {submitting ? "送信中..." : "回答する"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { EntryField, Player } from "@/types/room";
import { updatePlayerFields } from "@/lib/room";

interface MissingFieldsFormProps {
  roomId: string;
  playerId: string;
  player: Player;
  entryFields: EntryField[];
}

export function MissingFieldsForm({
  roomId,
  playerId,
  player,
  entryFields,
}: MissingFieldsFormProps) {
  // 未入力のフィールドを検出
  const missingFields = entryFields.filter((field) => {
    // nameは最初の登録で必ず入力されているはず
    if (field.id === "name") return false;
    const val = player.fields?.[field.id];
    return val === undefined || val === "";
  });

  const [formValues, setFormValues] = useState<Record<string, string | number>>(() => {
    const initial: Record<string, string | number> = {};
    missingFields.forEach((field) => {
      initial[field.id] = "";
    });
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (missingFields.length === 0 || submitted) return null;

  const isValid = missingFields.every((field) => {
    if (!field.required) return true;
    const val = formValues[field.id];
    return val !== undefined && val !== "";
  });

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    const fieldsToUpdate: Record<string, string | number> = {};
    missingFields.forEach((field) => {
      const val = formValues[field.id];
      fieldsToUpdate[field.id] = field.type === "number" ? Number(val) || 0 : String(val || "");
    });

    await updatePlayerFields(roomId, playerId, fieldsToUpdate);
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 mt-2">
      <p className="text-sm text-yellow-400 mb-3">追加の情報を入力してください</p>
      <div className="space-y-3">
        {missingFields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm text-gray-400 mb-1">
              {field.label}
              {field.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {field.type === "select" && field.options ? (
              <select
                value={String(formValues[field.id] || "")}
                onChange={(e) => setFormValues({ ...formValues, [field.id]: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-purple-500"
              >
                <option value="">選択してください</option>
                {field.options.filter(o => o.trim()).map((opt, i) => (
                  <option key={i} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={formValues[field.id] ?? ""}
                onChange={(e) => setFormValues({ ...formValues, [field.id]: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-purple-500"
              />
            )}
          </div>
        ))}
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded font-semibold transition"
        >
          {submitting ? "送信中..." : "追加情報を送信"}
        </button>
      </div>
    </div>
  );
}

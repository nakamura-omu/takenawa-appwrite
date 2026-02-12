"use client";

import { useState } from "react";
import { EntryField } from "@/types/room";
import { updateEntryFields } from "@/lib/room";

interface EntryFieldsEditorProps {
  roomId: string;
  fields: EntryField[];
  compact?: boolean;
}

export default function EntryFieldsEditor({
  roomId,
  fields,
  compact = false,
}: EntryFieldsEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<EntryField | null>(null);

  const handleAdd = () => {
    setDraft({
      id: `field_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
    });
    setAdding(true);
    setEditingIndex(null);
  };

  const handleEdit = (index: number) => {
    setDraft({ ...fields[index] });
    setEditingIndex(index);
    setAdding(false);
  };

  const handleSave = async () => {
    if (!draft || !draft.label.trim()) return;

    const cleanedDraft: EntryField = {
      ...draft,
      label: draft.label.trim(),
      options: draft.type === "select" ? draft.options?.filter((o) => o.trim()) : undefined,
    };

    let newFields: EntryField[];
    if (adding) {
      newFields = [...fields, cleanedDraft];
    } else if (editingIndex !== null) {
      newFields = fields.map((f, i) => (i === editingIndex ? cleanedDraft : f));
    } else {
      return;
    }

    await updateEntryFields(roomId, newFields);
    setDraft(null);
    setAdding(false);
    setEditingIndex(null);
  };

  const handleCancel = () => {
    setDraft(null);
    setAdding(false);
    setEditingIndex(null);
  };

  const handleRemove = async (index: number) => {
    // 名前フィールドは削除不可
    if (fields[index].id === "name") return;
    if (!confirm(`「${fields[index].label}」を削除しますか？`)) return;

    const newFields = fields.filter((_, i) => i !== index);
    await updateEntryFields(roomId, newFields);
  };

  const isEditing = adding || editingIndex !== null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex items-center justify-between">
        <p className={`${compact ? "text-xs" : "text-sm"} text-gray-400 font-semibold`}>
          エントリー項目（{fields.length}件）
        </p>
        {!isEditing && (
          <button
            onClick={handleAdd}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            + 追加
          </button>
        )}
      </div>

      {/* 既存フィールド一覧 */}
      <div className="space-y-1">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className={`flex items-center gap-2 ${compact ? "px-2 py-1" : "px-2 py-1.5"} bg-gray-800 rounded`}
          >
            <span className="text-xs text-gray-500 w-5">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <span className={`${compact ? "text-xs" : "text-sm"} text-gray-300`}>
                {field.label}
              </span>
              <span className="text-xs text-gray-500 ml-2">
                ({fieldTypeLabel(field.type)})
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </span>
            </div>
            {field.id !== "name" && !isEditing && (
              <div className="flex items-center gap-1 shrink-0">
                <label className="flex items-center gap-1 text-xs text-gray-500 mr-1" title="テーブル情報に表示">
                  <input
                    type="checkbox"
                    checked={field.showInHeader || false}
                    onChange={async (e) => {
                      const newFields = fields.map((f, j) =>
                        j === i ? { ...f, showInHeader: e.target.checked || undefined } : f
                      );
                      await updateEntryFields(roomId, newFields);
                    }}
                  />
                  卓表示
                </label>
                <button
                  onClick={() => handleEdit(i)}
                  className="text-xs text-gray-400 hover:text-white transition"
                >
                  編集
                </button>
                <button
                  onClick={() => handleRemove(i)}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  削除
                </button>
              </div>
            )}
            {field.id === "name" && (
              <span className="text-xs text-gray-600 shrink-0">必須</span>
            )}
          </div>
        ))}
      </div>

      {/* 追加/編集フォーム */}
      {isEditing && draft && (
        <div className="bg-gray-800 p-3 rounded border border-gray-700 space-y-2">
          <p className="text-xs text-gray-400 font-semibold">
            {adding ? "新規項目" : "項目を編集"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ラベル</label>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="項目名"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">タイプ</label>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as EntryField["type"],
                    options: e.target.value === "select" ? ["", ""] : undefined,
                  })
                }
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="text">テキスト</option>
                <option value="number">数値</option>
                <option value="select">選択肢</option>
              </select>
            </div>
          </div>

          {draft.type === "select" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">選択肢（1行に1つ）</label>
              <textarea
                value={(draft.options || []).join("\n")}
                onChange={(e) => setDraft({ ...draft, options: e.target.value.split("\n") })}
                placeholder={"選択肢1\n選択肢2"}
                rows={3}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
            必須項目にする
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!draft.label.trim()}
              className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-xs font-semibold transition"
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fieldTypeLabel(type: EntryField["type"]): string {
  switch (type) {
    case "text":
      return "テキスト";
    case "number":
      return "数値";
    case "select":
      return "選択肢";
  }
}

"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Room, Player, EntryField } from "@/types/room";

export interface RoomInfoPanelProps {
  roomId: string;
  room: Room;
  players: Record<string, Player> | null;
  participantUrl: string;
  isBeforeEntry: boolean;
  // 保存コールバック
  onSaveEventName: (name: string) => void;
  onSaveEventDate: (date: string) => void;
  onSaveAdminName: (name: string) => void;
  onSaveTableCount: (count: number) => void;
  // エントリーフィールド編集
  editingFields: boolean;
  setEditingFields: (v: boolean) => void;
  fieldsDraft: EntryField[];
  onStartEditFields: () => void;
  onSaveFields: () => void;
  onAddField: () => void;
  onRemoveField: (index: number) => void;
  onUpdateField: (index: number, updates: Partial<EntryField>) => void;
  onMoveField: (index: number, direction: -1 | 1) => void;
  // ルーム削除
  onDeleteRoom: () => void;
}

// インライン編集行
function EditableRow({
  label,
  value,
  displayValue,
  onSave,
  inputType = "text",
  inputProps,
}: {
  label: string;
  value: string | number;
  displayValue?: React.ReactNode;
  onSave: (val: string) => void;
  inputType?: "text" | "number" | "date";
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const handleSave = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="py-1.5">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <div className="flex gap-2 items-center">
          <input
            type={inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
            {...inputProps}
          />
          <button
            onClick={handleSave}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition"
          >
            保存
          </button>
          <button
            onClick={handleCancel}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline justify-between py-1.5 cursor-pointer hover:bg-gray-800/50 rounded px-1 -mx-1 transition"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
    >
      <span className="text-xs text-gray-500 shrink-0 mr-2">{label}</span>
      <span className="text-sm font-medium text-right truncate">
        {displayValue ?? (String(value) || <span className="text-gray-600">未設定</span>)}
      </span>
    </div>
  );
}

export default function RoomInfoPanel({
  roomId,
  room,
  players,
  participantUrl,
  isBeforeEntry,
  onSaveEventName,
  onSaveEventDate,
  onSaveAdminName,
  onSaveTableCount,
  editingFields,
  setEditingFields,
  fieldsDraft,
  onStartEditFields,
  onSaveFields,
  onAddField,
  onRemoveField,
  onUpdateField,
  onMoveField,
  onDeleteRoom,
}: RoomInfoPanelProps) {
  // A4印刷用QRコード（5列×7行＝35枚敷き詰め）
  const handlePrintQR = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const cols = 5;
    const rows = 7;
    const total = cols * rows;
    const eventName = room?.config.eventName || "";

    const svgEl = document.querySelector(".qr-container svg");
    let svgDataUri = "";
    if (svgEl) {
      const clone = svgEl.cloneNode(true) as SVGElement;
      clone.setAttribute("width", "100");
      clone.setAttribute("height", "100");
      const svgStr = new XMLSerializer().serializeToString(clone);
      svgDataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    }

    let cells = "";
    for (let i = 0; i < total; i++) {
      cells += `<div class="cell">
        <img src="${svgDataUri}" />
        <div class="label">${eventName}</div>
        <div class="room-id">${roomId}</div>
      </div>`;
    }

    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>QRコード印刷 - ${eventName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 5mm; }
  body { width: 200mm; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    width: 200mm;
    height: 287mm;
    gap: 0;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 0.5px dashed #ccc;
    padding: 2mm;
    overflow: hidden;
  }
  .cell img { width: 28mm; height: 28mm; }
  .label { font-family: sans-serif; font-size: 7pt; margin-top: 1mm; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 36mm; }
  .room-id { font-family: monospace; font-size: 8pt; font-weight: bold; letter-spacing: 0.05em; }
</style></head><body>
  <div class="grid">${cells}</div>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const playerCount = players ? Object.keys(players).length : 0;

  return (
    <section className="bg-gray-900 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">
        ルーム情報
      </h2>

      {/* QRコード & ID */}
      <div className="flex gap-4 items-start">
        <div className="qr-container bg-white p-2 rounded shrink-0">
          <QRCodeSVG value={participantUrl} size={120} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">ルームID</p>
          <p className="text-xl font-mono font-bold tracking-wider">{roomId}</p>
          <p className="text-xs text-gray-500 mt-2 break-all">{participantUrl}</p>
          <button
            onClick={handlePrintQR}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition"
          >
            A4印刷用
          </button>
        </div>
      </div>

      {/* イベント設定 */}
      <div className="border-t border-gray-800 pt-3">
        <EditableRow
          label="イベント名"
          value={room.config.eventName}
          onSave={onSaveEventName}
        />
        <EditableRow
          label="日時"
          value={room.config.eventDate}
          onSave={onSaveEventDate}
          inputType="date"
        />
        <EditableRow
          label="主催者名"
          value={room.config.adminName || ""}
          displayValue={room.config.adminName || <span className="text-gray-600">未設定</span>}
          onSave={onSaveAdminName}
          inputProps={{ placeholder: "例: 幹事 太郎" }}
        />
        <EditableRow
          label="テーブル数"
          value={room.config.tableCount}
          displayValue={<>{room.config.tableCount}卓</>}
          onSave={(v) => onSaveTableCount(Number(v) || 1)}
          inputType="number"
          inputProps={{ min: 1, max: 20 }}
        />
        <div className="flex items-baseline justify-between py-1.5 px-1 -mx-1">
          <span className="text-xs text-gray-500">参加者数</span>
          <span className="text-sm font-medium">{playerCount}人</span>
        </div>
      </div>

      {/* エントリーフィールド設定 */}
      <div className="border-t border-gray-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">エントリー項目</p>
          {isBeforeEntry && !editingFields && (
            <button
              onClick={onStartEditFields}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              編集
            </button>
          )}
        </div>

        {editingFields ? (
          <div className="space-y-3">
            {fieldsDraft.map((field, idx) => (
              <div key={idx} className="bg-gray-800 p-2 rounded space-y-2">
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => onUpdateField(idx, { label: e.target.value })}
                    placeholder="項目名"
                    className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => onMoveField(idx, -1)}
                    disabled={idx === 0}
                    className="px-1 py-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMoveField(idx, 1)}
                    disabled={idx === fieldsDraft.length - 1}
                    className="px-1 py-1 text-gray-400 hover:text-white disabled:opacity-30 text-xs"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onRemoveField(idx)}
                    className="px-1 py-1 text-red-400 hover:text-red-300 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={field.type}
                    onChange={(e) => onUpdateField(idx, { type: e.target.value as EntryField["type"] })}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="text">テキスト</option>
                    <option value="number">数値</option>
                    <option value="select">セレクト</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => onUpdateField(idx, { required: e.target.checked })}
                    />
                    必須
                  </label>
                </div>
                {field.type === "select" && (
                  <textarea
                    value={(field.options || []).join("\n")}
                    onChange={(e) => onUpdateField(idx, { options: e.target.value.split("\n") })}
                    placeholder={"選択肢（1行に1つ）\n例:\n選択肢1\n選択肢2"}
                    rows={3}
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
                  />
                )}
              </div>
            ))}
            <button
              onClick={onAddField}
              className="w-full py-1 border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded text-sm transition"
            >
              + 項目を追加
            </button>
            <div className="flex gap-2">
              <button
                onClick={onSaveFields}
                disabled={fieldsDraft.some((f) => !f.label.trim())}
                className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm transition"
              >
                保存
              </button>
              <button
                onClick={() => setEditingFields(false)}
                className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {(room.config.entryFields || [{ id: "name", label: "名前", type: "text" as const, required: true }]).map((field, idx) => (
              <div key={idx} className="text-sm flex items-center gap-2">
                <span>{field.label}</span>
                <span className="text-xs text-gray-500">
                  ({field.type === "text" ? "テキスト" : field.type === "number" ? "数値" : "セレクト"})
                </span>
                {field.required && <span className="text-xs text-red-400">必須</span>}
              </div>
            ))}
            {!isBeforeEntry && (
              <p className="text-xs text-gray-600 mt-1">※ 受付開始後は編集できません</p>
            )}
          </div>
        )}
      </div>

      {/* TODO: 将来的にはアーカイブ機能として実装予定 */}
      {/* <button
        onClick={onDeleteRoom}
        className="w-full py-2 bg-red-900 hover:bg-red-800 rounded text-sm transition"
      >
        ルームを削除
      </button> */}
    </section>
  );
}

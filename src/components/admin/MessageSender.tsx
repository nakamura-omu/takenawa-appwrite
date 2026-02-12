"use client";

import { useState, useEffect } from "react";
import { Room, Player, AdminMessage, MessageTarget } from "@/types/room";
import { sendAdminMessage, subscribeToMessages } from "@/lib/room";

export interface MessageSenderProps {
  roomId: string;
  room: Room;
  players: Record<string, Player> | null;
}

export default function MessageSender({ roomId, room, players }: MessageSenderProps) {
  const [text, setText] = useState("");
  const [targetType, setTargetType] = useState<"all" | "table" | "player">("all");
  const [targetTable, setTargetTable] = useState(1);
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Record<string, AdminMessage> | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMessages(roomId, setMessages);
    return unsub;
  }, [roomId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    let target: MessageTarget;
    if (targetType === "table") {
      target = { type: "table", tableNumber: targetTable };
    } else if (targetType === "player") {
      target = { type: "player", playerId: targetPlayerId };
    } else {
      target = { type: "all" };
    }

    await sendAdminMessage(roomId, text.trim(), target, room.state.currentStep);
    setText("");
    setSending(false);
  };

  const playerList = players ? Object.entries(players) : [];
  const messageList = messages
    ? Object.values(messages).sort((a, b) => a.sentAt - b.sentAt)
    : [];

  const formatTarget = (t: MessageTarget): string => {
    if (t.type === "all") return "全員";
    if (t.type === "table") return `テーブル${t.tableNumber}`;
    if (t.type === "player") {
      const p = players?.[t.playerId];
      return p ? p.name : t.playerId;
    }
    return "不明";
  };

  return (
    <div className="border-t border-gray-700 pt-3 mt-3">
      <p className="text-xs font-semibold text-gray-400 mb-2">メッセージ送信</p>

      {/* ターゲット選択 */}
      <div className="flex gap-2 mb-2 items-center">
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as "all" | "table" | "player")}
          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
        >
          <option value="all">全員</option>
          <option value="table">テーブル指定</option>
          <option value="player">個人指定</option>
        </select>

        {targetType === "table" && (
          <select
            value={targetTable}
            onChange={(e) => setTargetTable(Number(e.target.value))}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
          >
            {Array.from({ length: room.config.tableCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>テーブル {i + 1}</option>
            ))}
          </select>
        )}

        {targetType === "player" && (
          <select
            value={targetPlayerId}
            onChange={(e) => setTargetPlayerId(e.target.value)}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">選択...</option>
            {playerList.map(([id, p]) => (
              <option key={id} value={id}>{p.name}（テーブル{p.tableNumber}）</option>
            ))}
          </select>
        )}
      </div>

      {/* テキスト入力 + 送信 */}
      <div className="flex gap-2 mb-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージを入力..."
          rows={2}
          className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 resize-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || (targetType === "player" && !targetPlayerId)}
          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded text-sm font-semibold transition self-end"
        >
          送信
        </button>
      </div>

      {/* 送信履歴 */}
      {messageList.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-gray-500 hover:text-gray-300 transition mb-1"
          >
            送信済み ({messageList.length}件) {showHistory ? "▲" : "▼"}
          </button>
          {showHistory && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {messageList.map((msg) => (
                <div key={msg.id} className="bg-gray-800 rounded px-2 py-1 text-xs">
                  <span className="text-yellow-400 mr-1">[{formatTarget(msg.target)}]</span>
                  <span className="text-gray-300">{msg.text}</span>
                  <span className="text-gray-600 ml-2">Step {msg.sentDuringStep + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

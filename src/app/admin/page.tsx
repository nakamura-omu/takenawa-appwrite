"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createRoom,
  subscribeToRoom,
  updateTableCount,
  updateScenario,
  goToNextStep,
  goToPrevStep,
  setPhase,
  sendQuestion,
  closeQuestion,
  revealAnswers,
  deleteRoom,
  subscribeToPlayers,
} from "@/lib/room";
import { Room, Player, ScenarioStep, StepType, GameType, DEFAULT_SCENARIO_STEPS } from "@/types/room";

export default function AdminPage() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Record<string, Player> | null>(null);
  const [tableCount, setTableCountInput] = useState(6);
  const [customRoomId, setCustomRoomId] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // ルームの購読
  useEffect(() => {
    if (!roomId) return;

    const unsubRoom = subscribeToRoom(roomId, setRoom);
    const unsubPlayers = subscribeToPlayers(roomId, setPlayers);

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId]);

  // ルーム作成
  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const id = await createRoom(tableCount, customRoomId || undefined);
      setRoomId(id);
    } catch (error) {
      console.error("ルーム作成エラー:", error);
      alert("ルーム作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  // ルーム削除
  const handleDeleteRoom = async () => {
    if (!roomId) return;
    if (!confirm("本当にルームを削除しますか？")) return;
    await deleteRoom(roomId);
    setRoomId(null);
    setRoom(null);
    setPlayers(null);
  };

  // 参加者URL
  const participantUrl = roomId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?room=${roomId}`
    : "";

  // 現在のステップ
  const currentStep = room?.scenario?.steps?.[room.state.currentStep];

  // テーブルごとの参加者
  const playersByTable: Record<number, Player[]> = {};
  if (players) {
    Object.values(players).forEach((player) => {
      if (!playersByTable[player.tableNumber]) {
        playersByTable[player.tableNumber] = [];
      }
      playersByTable[player.tableNumber].push(player);
    });
  }

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">管理者画面</h1>
        <p className="text-gray-400 text-sm">宴会ゲーム進行管理</p>
      </header>

      {!roomId ? (
        // ルーム作成画面
        <section className="max-w-md mx-auto bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-6">新しいルームを作成</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                ルームID（空欄で自動生成）
              </label>
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value.toUpperCase())}
                placeholder="例: PARTY1"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                テーブル数
              </label>
              <input
                type="number"
                value={tableCount}
                onChange={(e) => setTableCountInput(Number(e.target.value))}
                min={1}
                max={20}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold transition"
            >
              {isCreating ? "作成中..." : "ルームを作成"}
            </button>
          </div>
        </section>
      ) : (
        // ルーム管理画面
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* 左: ルーム情報・QRコード */}
          <section className="lg:col-span-3 bg-gray-900 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">
              ルーム情報
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400">ルームID</p>
                <p className="text-2xl font-mono font-bold tracking-wider">{roomId}</p>
              </div>

              <div>
                <p className="text-sm text-gray-400 mb-2">参加用QRコード</p>
                <div className="bg-white p-3 rounded inline-block">
                  <QRCodeSVG value={participantUrl} size={160} />
                </div>
                <p className="text-xs text-gray-500 mt-2 break-all">{participantUrl}</p>
              </div>

              <div>
                <p className="text-sm text-gray-400">テーブル数</p>
                <p className="text-lg font-semibold">{room?.config.tableCount}卓</p>
              </div>

              <div>
                <p className="text-sm text-gray-400">参加者数</p>
                <p className="text-lg font-semibold">
                  {players ? Object.keys(players).length : 0}人
                </p>
              </div>

              <button
                onClick={handleDeleteRoom}
                className="w-full py-2 bg-red-900 hover:bg-red-800 rounded text-sm transition"
              >
                ルームを削除
              </button>
            </div>
          </section>

          {/* 中央: 台本・進行 */}
          <section className="lg:col-span-6 bg-gray-900 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">
              台本・進行
            </h2>

            {/* 進行コントロール */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => goToPrevStep(roomId)}
                disabled={room?.state.currentStep === 0}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded transition"
              >
                ← 前へ
              </button>
              <button
                onClick={() => goToNextStep(roomId)}
                disabled={
                  room?.state.currentStep === (room?.scenario?.steps?.length || 1) - 1
                }
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded transition"
              >
                次へ →
              </button>
              <span className="ml-auto text-sm text-gray-400 self-center">
                フェーズ: <span className="text-white font-semibold">{room?.state.phase}</span>
              </span>
            </div>

            {/* ステップ一覧 */}
            <div className="space-y-2 mb-6">
              {room?.scenario?.steps?.map((step, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border ${
                    index === room.state.currentStep
                      ? "border-blue-500 bg-blue-900/30"
                      : index < room.state.currentStep
                      ? "border-gray-700 bg-gray-800/50 opacity-60"
                      : "border-gray-700 bg-gray-800/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Step {index + 1}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        step.type === "table_game"
                          ? "bg-green-900 text-green-300"
                          : step.type === "whole_game"
                          ? "bg-purple-900 text-purple-300"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {step.type}
                    </span>
                    {step.gameType && (
                      <span className="text-xs text-gray-400">{step.gameType}</span>
                    )}
                  </div>
                  <p className="font-medium mt-1">{step.label}</p>
                </div>
              ))}
            </div>

            {/* ゲーム操作パネル */}
            {currentStep && (currentStep.type === "table_game" || currentStep.type === "whole_game") && (
              <div className="border-t border-gray-700 pt-4">
                <h3 className="font-semibold mb-3">ゲーム操作</h3>

                {/* お題入力 */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="お題を入力..."
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (questionText.trim()) {
                        sendQuestion(roomId, questionText.trim(), currentStep.config?.timeLimit || 30);
                        setQuestionText("");
                      }
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
                  >
                    送出
                  </button>
                </div>

                {/* 回答状況 */}
                {room?.currentGame?.question && (
                  <div className="bg-gray-800 p-3 rounded mb-3">
                    <p className="text-sm text-gray-400">現在のお題</p>
                    <p className="text-lg font-medium">{room.currentGame.question.text}</p>
                    <p className="text-sm text-gray-400 mt-2">
                      ステータス:{" "}
                      <span
                        className={`font-semibold ${
                          room.currentGame.question.status === "open"
                            ? "text-green-400"
                            : room.currentGame.question.status === "closed"
                            ? "text-yellow-400"
                            : "text-blue-400"
                        }`}
                      >
                        {room.currentGame.question.status}
                      </span>
                    </p>
                  </div>
                )}

                {/* 操作ボタン */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setPhase(roomId, "playing")}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                  >
                    回答受付開始
                  </button>
                  <button
                    onClick={() => closeQuestion(roomId)}
                    className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 rounded text-sm transition"
                  >
                    回答締切
                  </button>
                  <button
                    onClick={() => revealAnswers(roomId)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition"
                  >
                    結果公開
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 右: 参加者モニター */}
          <section className="lg:col-span-3 bg-gray-900 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 border-b border-gray-700 pb-2">
              参加者
            </h2>

            {!players || Object.keys(players).length === 0 ? (
              <p className="text-gray-500 text-sm">参加者待ち...</p>
            ) : (
              <div className="space-y-4">
                {Array.from({ length: room?.config.tableCount || 0 }, (_, i) => i + 1).map(
                  (tableNum) => (
                    <div key={tableNum}>
                      <p className="text-sm text-gray-400 mb-1">テーブル {tableNum}</p>
                      <div className="space-y-1">
                        {playersByTable[tableNum]?.map((player, idx) => (
                          <div
                            key={idx}
                            className={`px-2 py-1 rounded text-sm ${
                              player.connected
                                ? "bg-green-900/30 text-green-300"
                                : "bg-gray-800 text-gray-500"
                            }`}
                          >
                            {player.name}
                          </div>
                        )) || (
                          <p className="text-xs text-gray-600">（空席）</p>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

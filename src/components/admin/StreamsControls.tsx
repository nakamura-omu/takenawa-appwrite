"use client";

import { useState } from "react";
import { Room, ScenarioStep, GameType } from "@/types/room";
import { initStreamsGame, flipCard } from "@/lib/room";
import { getColorStyle, getColorLabel } from "@/lib/deckGenerator";

interface StreamsControlsProps {
  roomId: string;
  room: Room;
  step: ScenarioStep;
}

function gameTypeLabel(type: GameType): string {
  switch (type) {
    case "krukkurin": return "くるっくりん";
    case "meta_streams": return "メタストリームス";
    default: return type;
  }
}

export default function StreamsControls({ roomId, room, step }: StreamsControlsProps) {
  const [flipping, setFlipping] = useState(false);

  const currentGame = room.currentGame;
  const isGameActive = !!currentGame?.streams;
  const streams = currentGame?.streams;
  const boards = currentGame?.boards;
  const gameType = step.gameType as GameType;
  const isKrukkurin = gameType === "krukkurin";

  const handleStartGame = async () => {
    await initStreamsGame(roomId, gameType);
  };

  const handleFlip = async () => {
    if (flipping) return;
    setFlipping(true);
    await flipCard(roomId);
    setFlipping(false);
  };

  const playerEntries = boards
    ? Object.entries(boards).map(([pid, board]) => ({
        pid,
        board,
        name: room.players?.[pid]?.name || pid.slice(0, 6),
      }))
    : [];

  const activePlayers = playerEntries.filter((p) => !p.board.eliminated && !p.board.completed);
  const allActed = activePlayers.length > 0 && activePlayers.every((p) => p.board.acted);
  const allOut = activePlayers.length === 0 && playerEntries.length > 0;

  const deckRemaining = streams ? streams.deck.length - (streams.currentCardIdx + 1) : 0;
  const cardsPerFlip = isKrukkurin ? 2 : 1;
  const flipsRemaining = Math.floor(deckRemaining / cardsPerFlip);
  const hasFlippedCard = !!streams?.currentCard;

  return (
    <div className="border-t border-gray-700 pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-400 mb-2">ゲーム操作</p>

      {/* ゲーム開始（未開始時） */}
      {!isGameActive && gameType && (
        <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-700">
          <p className="text-xs text-gray-400 mb-2">
            {gameTypeLabel(gameType)} — 全体モード
          </p>
          <button
            onClick={handleStartGame}
            className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold transition"
          >
            ゲーム開始
          </button>
        </div>
      )}

      {/* ゲーム実行中 */}
      {isGameActive && streams && (
        <>
          {/* ステータスバー */}
          <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-700">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="px-1.5 py-0.5 bg-green-900 text-green-300 rounded">実行中</span>
              <span>{gameTypeLabel(currentGame!.type)}</span>
              <span className="text-gray-600">|</span>
              <span>残り {flipsRemaining}回</span>
            </div>
          </div>

          {/* 現在のカード */}
          {hasFlippedCard && streams.currentCard && (
            isKrukkurin && streams.currentCard.items ? (
              <div className="mb-3 p-4 bg-gradient-to-br from-purple-900/40 to-indigo-900/40 rounded-lg border border-purple-700/50 text-center">
                <p className="text-xs text-purple-400 mb-2">現在のカード</p>
                <div className="flex items-center justify-center gap-4">
                  {streams.currentCard.items.map((item, idx) => {
                    const cs = getColorStyle(item.color);
                    const label = getColorLabel(item.color);
                    return (
                      <div key={idx} className="px-4 py-2 rounded-lg" style={{ backgroundColor: cs.bg, color: cs.text }}>
                        <span className="text-3xl font-black">{item.number}</span>
                        <span className="text-lg ml-1">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-3 p-4 bg-gradient-to-br from-purple-900/40 to-indigo-900/40 rounded-lg border border-purple-700/50 text-center">
                <p className="text-xs text-purple-400 mb-1">現在のカード</p>
                <div className="text-4xl font-black text-white mb-1">
                  {streams.currentCard.number}
                </div>
                <div className="text-lg font-bold text-yellow-400">
                  {streams.currentCard.points}pt
                </div>
              </div>
            )
          )}

          {/* めくるボタン */}
          <div className="mb-3">
            {allOut ? (
              <div className="p-2 bg-red-900/30 rounded border border-red-700/30 text-center">
                <p className="text-sm text-red-400 font-semibold">全員脱落・完了</p>
              </div>
            ) : (
              <button
                onClick={handleFlip}
                disabled={flipping || (hasFlippedCard && !allActed) || deckRemaining < cardsPerFlip}
                className={`w-full py-3 rounded text-sm font-semibold transition ${
                  allActed || !hasFlippedCard
                    ? "bg-purple-600 hover:bg-purple-700 text-white animate-pulse"
                    : "bg-gray-700 text-gray-400"
                } disabled:bg-gray-600 disabled:text-gray-500 disabled:animate-none`}
              >
                {flipping
                  ? "めくり中..."
                  : !hasFlippedCard
                  ? "最初のカードをめくる"
                  : allActed
                  ? "次のカードをめくる"
                  : `待機中... (${activePlayers.filter((p) => p.board.acted).length}/${activePlayers.length})`}
              </button>
            )}
          </div>

          {/* プレイヤー状況テーブル */}
          <div className="mb-2">
            <p className="text-xs text-gray-500 mb-1">プレイヤー状況:</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {playerEntries
                .sort((a, b) => b.board.score - a.board.score)
                .map(({ pid, board, name }) => (
                  <div
                    key={pid}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                      board.eliminated
                        ? "bg-red-900/20 border border-red-700/30"
                        : board.completed
                        ? "bg-green-900/20 border border-green-700/30"
                        : board.acted
                        ? "bg-gray-800/80 border border-gray-700/50"
                        : "bg-yellow-900/20 border border-yellow-700/30"
                    }`}
                  >
                    <span className="text-gray-300 flex-1 truncate">{name}</span>
                    <span className="text-white font-semibold w-12 text-right">{board.score}pt</span>
                    <span className="text-gray-500 w-10 text-center">P:{board.passCount}/4</span>
                    {board.eliminated && (
                      <span className="px-1.5 py-0.5 bg-red-800 text-red-300 rounded text-xs">脱落</span>
                    )}
                    {board.completed && (
                      <span className="px-1.5 py-0.5 bg-green-800 text-green-300 rounded text-xs">完了</span>
                    )}
                    {!board.eliminated && !board.completed && hasFlippedCard && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        board.acted
                          ? "bg-blue-800 text-blue-300"
                          : "bg-yellow-800 text-yellow-300"
                      }`}>
                        {board.acted ? "済" : "未"}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* めくり履歴 */}
          {streams.history && streams.history.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1">めくり履歴 ({streams.history.length}枚):</p>
              <div className="flex flex-wrap gap-1">
                {streams.history.map((card, i) => (
                  isKrukkurin && card.items ? (
                    <span key={i} className="flex gap-0.5">
                      {card.items.map((item, j) => {
                        const cs = getColorStyle(item.color);
                        return (
                          <span key={j} className="px-1 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: cs.bg, color: cs.text }}>
                            {item.number}{getColorLabel(item.color)}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-400"
                    >
                      {card.number}({card.points})
                    </span>
                  )
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

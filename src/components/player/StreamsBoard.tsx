"use client";

import { useState, useEffect } from "react";
import { Room, GameType } from "@/types/room";
import { placeCard, passCard } from "@/lib/room";
import { getBoardLayout, getColorStyle, getColorLabel } from "@/lib/deckGenerator";

interface StreamsBoardProps {
  roomId: string;
  room: Room;
  playerId: string;
}

export function StreamsBoard({ roomId, room, playerId }: StreamsBoardProps) {
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);

  const currentGame = room.currentGame;
  const streams = currentGame?.streams;
  const boardOrNull = currentGame?.boards?.[playerId];
  const gameType = currentGame?.type as GameType;
  const currentCard = streams?.currentCard;
  const isKrukkurin = gameType === "krukkurin";

  // カードが変わったら選択をリセット
  const cardFlippedAt = currentCard?.flippedAt;
  useEffect(() => {
    setSelectedItemIdx(null);
    setError(null);
  }, [cardFlippedAt]);

  if (!streams || !boardOrNull || !boardOrNull.rows) return null;
  const board = boardOrNull;

  const layout = getBoardLayout(gameType);
  const isEliminated = board.eliminated;
  const isCompleted = board.completed;
  const hasActed = board.acted;
  const passRemaining = 4 - board.passCount;
  const boardRows = board.rows;
  const boardColors = board.colors;

  // 配置する数字（くるっくりん: 選択中アイテム / meta_streams: カード数字）
  const activeNumber = isKrukkurin
    ? (selectedItemIdx !== null ? currentCard?.items?.[selectedItemIdx]?.number ?? 0 : 0)
    : (currentCard?.number ?? 0);

  const hasSelection = isKrukkurin ? selectedItemIdx !== null : true;

  function canPlace(rowIndex: number, slotIndex: number): boolean {
    if (!currentCard || isEliminated || isCompleted || hasActed || !hasSelection) return false;
    const row = boardRows[rowIndex];
    if (!row || row[slotIndex] !== 0) return false;

    let leftVal = 0;
    for (let i = slotIndex - 1; i >= 0; i--) {
      if (row[i] !== 0) { leftVal = row[i]; break; }
    }
    if (leftVal !== 0 && leftVal > activeNumber) return false;

    let rightVal = 0;
    for (let i = slotIndex + 1; i < row.length; i++) {
      if (row[i] !== 0) { rightVal = row[i]; break; }
    }
    if (rightVal !== 0 && rightVal < activeNumber) return false;

    return true;
  }

  function canPlaceInRow(rowIndex: number): boolean {
    if (!currentCard || isEliminated || isCompleted || hasActed || !hasSelection) return false;
    const row = boardRows[rowIndex];
    if (!row) return false;
    return row.some((_, si) => canPlace(rowIndex, si));
  }

  const canPlaceAnywhere = hasSelection && boardRows.some((_, ri) => canPlaceInRow(ri));

  // どちらのアイテムも配置不能かチェック
  const canPlaceEither = isKrukkurin && currentCard?.items
    ? currentCard.items.some((item) => {
        return boardRows.some((row, ri) =>
          row.some((val, si) => {
            if (val !== 0) return false;
            let lv = 0;
            for (let i = si - 1; i >= 0; i--) { if (row[i] !== 0) { lv = row[i]; break; } }
            if (lv !== 0 && lv > item.number) return false;
            let rv = 0;
            for (let i = si + 1; i < row.length; i++) { if (row[i] !== 0) { rv = row[i]; break; } }
            if (rv !== 0 && rv < item.number) return false;
            return true;
          })
        );
      })
    : true;

  const handlePlace = async (rowIndex: number, slotIndex: number) => {
    if (placing || !canPlace(rowIndex, slotIndex)) return;
    setPlacing(true);
    setError(null);
    const iIdx = isKrukkurin ? selectedItemIdx! : undefined;
    const result = await placeCard(roomId, playerId, rowIndex, slotIndex, iIdx);
    if (!result.success) {
      setError(result.error || "配置に失敗しました");
    }
    setPlacing(false);
  };

  const handlePass = async () => {
    if (placing || hasActed || isEliminated || isCompleted) return;
    setPlacing(true);
    setError(null);
    const result = await passCard(roomId, playerId);
    if (!result.success) {
      setError(result.error || "パスに失敗しました");
    }
    setPlacing(false);
  };

  return (
    <div className="space-y-3 relative">
      {/* 脱落オーバーレイ */}
      {isEliminated && (
        <div className="absolute inset-0 bg-black/60 z-10 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-black text-red-400 mb-1">脱落</p>
            <p className="text-sm text-gray-400">最終スコア: {board.score}pt</p>
          </div>
        </div>
      )}

      {/* 完了オーバーレイ */}
      {isCompleted && (
        <div className="absolute inset-0 bg-black/40 z-10 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-black text-green-400 mb-1">完了!</p>
            <p className="text-sm text-gray-300">最終スコア: {board.score}pt</p>
          </div>
        </div>
      )}

      {/* 現在のカード */}
      {currentCard ? (
        isKrukkurin && currentCard.items ? (
          <div className="p-3 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 rounded-lg border border-purple-700/40 text-center">
            <p className="text-xs text-purple-400 mb-1">
              {hasActed ? "配置済み" : "どちらか1つを選んでタップ"}
            </p>
            <div className="flex items-center justify-center gap-3">
              {currentCard.items.map((item, idx) => {
                const cs = getColorStyle(item.color);
                const label = getColorLabel(item.color);
                const isSelected = selectedItemIdx === idx && !hasActed;
                const isDimmed = hasActed || (selectedItemIdx !== null && !isSelected);
                return (
                  <button
                    key={idx}
                    onClick={() => !hasActed && setSelectedItemIdx(idx)}
                    disabled={hasActed}
                    style={{ backgroundColor: cs.bg, color: cs.text, opacity: isDimmed ? 0.3 : 1 }}
                    className={`
                      px-4 py-2.5 rounded-lg font-black text-xl transition-all
                      ${isSelected
                        ? "ring-3 ring-yellow-400 scale-110 shadow-lg shadow-yellow-400/30 cursor-pointer"
                        : hasActed
                        ? "cursor-default"
                        : "hover:brightness-110 cursor-pointer"
                      }
                    `}
                  >
                    {item.number}<span className="text-base ml-0.5">{label}</span>
                  </button>
                );
              })}
            </div>
            {hasActed && !isEliminated && !isCompleted && (
              <p className="text-xs text-green-400 mt-1">配置完了 — 次のカードを待っています</p>
            )}
            {!hasActed && selectedItemIdx !== null && (
              <p className="text-xs text-yellow-300 mt-1">ボードのマスをタップして配置</p>
            )}
          </div>
        ) : (
          <div className="p-3 bg-gradient-to-br from-purple-900/30 to-indigo-900/30 rounded-lg border border-purple-700/40 text-center">
            <p className="text-xs text-purple-400 mb-0.5">現在のカード</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-black text-white">{currentCard.number}</span>
              <span className="text-lg font-bold text-yellow-400">({currentCard.points}pt)</span>
            </div>
            {hasActed && !isEliminated && !isCompleted && (
              <p className="text-xs text-green-400 mt-1">アクション済み — 次のカードを待っています</p>
            )}
          </div>
        )
      ) : (
        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/30 text-center">
          <p className="text-sm text-gray-500">管理者がカードをめくるのを待っています...</p>
        </div>
      )}

      {/* ボードグリッド */}
      <div className="space-y-2">
        {board.rows.map((row, ri) => (
          <div key={ri}>
            {layout.labels[ri] && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-400">
                  {layout.labels[ri]}（{row.length}マス）
                </span>
              </div>
            )}
            <div className={`flex flex-wrap gap-1 p-1.5 rounded border ${layout.colors[ri] || "bg-gray-800/40 border-gray-700/50"}`}>
              {row.map((val, si) => {
                const placeable = canPlace(ri, si);
                const isEmpty = val === 0;
                const cellColor = isKrukkurin ? boardColors?.[ri]?.[si] : "";
                const cs = cellColor ? getColorStyle(cellColor) : null;
                return (
                  <button
                    key={si}
                    disabled={!placeable || placing}
                    onClick={() => handlePlace(ri, si)}
                    style={!isEmpty && cs ? { backgroundColor: cs.bg, color: cs.text, borderColor: cs.border } : undefined}
                    className={`
                      min-w-9 h-9 px-1 rounded text-[10px] font-bold flex items-center justify-center transition-all
                      ${!isEmpty && cs
                        ? "cursor-default border"
                        : !isEmpty
                        ? "bg-gray-700 text-white cursor-default border border-gray-600"
                        : placeable
                        ? "bg-purple-800/60 text-purple-300 border-2 border-purple-500 hover:bg-purple-700/80 cursor-pointer animate-pulse"
                        : "bg-gray-800/60 text-gray-600 border border-gray-700/50 cursor-default"
                      }
                    `}
                  >
                    {isEmpty
                      ? placeable ? "+" : si === 0 ? "LOW" : si === row.length - 1 ? "HI" : "_"
                      : val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* スコアとパス情報 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">パス残り: <span className="text-white font-semibold">{passRemaining}回</span></span>
        <span className="text-gray-400">スコア: <span className="text-yellow-400 font-bold">{board.score}pt</span></span>
      </div>

      {/* パスボタン */}
      {currentCard && !hasActed && !isEliminated && !isCompleted && (
        <button
          onClick={handlePass}
          disabled={placing}
          className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded font-semibold text-sm text-gray-300 transition border border-gray-600"
        >
          {placing ? "処理中..." : `パスする (-1pt) | 残り${passRemaining}回`}
        </button>
      )}

      {/* 配置不可能警告 */}
      {currentCard && !hasActed && !isEliminated && !isCompleted && isKrukkurin && !canPlaceEither && (
        <p className="text-xs text-orange-400 text-center">どちらも配置できません。パスしてください。</p>
      )}
      {currentCard && !hasActed && !isEliminated && !isCompleted && !isKrukkurin && !canPlaceAnywhere && (
        <p className="text-xs text-orange-400 text-center">配置可能なマスがありません。パスしてください。</p>
      )}

      {/* エラー表示 */}
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}

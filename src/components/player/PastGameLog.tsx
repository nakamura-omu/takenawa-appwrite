"use client";

import { GameResult, Player } from "@/types/room";
import { getBoardLayout, getColorStyle } from "@/lib/deckGenerator";

interface PastGameLogProps {
  gameResult: GameResult;
  playerId: string;
  allPlayers: Record<string, Player> | null;
}

// Streams系ゲームのボード結果表示
function StreamsPastResult({
  gameResult,
  playerId,
}: PastGameLogProps) {
  const myBoard = gameResult.boards?.[playerId];
  const layout = getBoardLayout(gameResult.type);

  if (!myBoard) return null;

  return (
    <div className="rounded-lg p-4 bg-gray-800/50 border border-gray-700/30">
      <p className="text-xs text-purple-400 mb-2">あなたのボード</p>
      <div className="space-y-1.5">
        {myBoard.rows.map((row, ri) => (
          <div key={ri}>
            {layout.labels[ri] && (
              <span className="text-xs text-gray-500">{layout.labels[ri]}</span>
            )}
            <div className="flex flex-wrap gap-1">
              {row.map((val, si) => {
                const cellColor = myBoard.colors?.[ri]?.[si];
                const cs = cellColor ? getColorStyle(cellColor) : null;
                return (
                  <span
                    key={si}
                    style={val !== null && cs ? { backgroundColor: cs.bg, color: cs.text, borderColor: cs.border } : undefined}
                    className={`w-8 h-8 rounded text-xs font-bold flex items-center justify-center ${
                      val !== null && cs
                        ? "border"
                        : val !== null
                        ? "bg-gray-700 text-white border border-gray-600"
                        : "bg-gray-800/60 text-gray-600 border border-gray-700/50"
                    }`}
                  >
                    {val !== null ? val : "_"}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
        <span>パス: {myBoard.passCount}回</span>
        <span className="text-yellow-400 font-semibold">スコア: {myBoard.score}pt</span>
        {myBoard.eliminated && <span className="text-red-400">脱落</span>}
        {myBoard.completed && <span className="text-green-400">完了</span>}
      </div>
    </div>
  );
}

// 過去のゲーム結果をログ表示（ステップ終了後に残る表示）
// スコアボードは reveal ステップ（displayType="scoreboard"）で別途表示する想定
export function PastGameLog({ gameResult, playerId, allPlayers }: PastGameLogProps) {
  // Streams系ゲーム
  if (gameResult.type === "krukkurin" || gameResult.type === "meta_streams") {
    return (
      <StreamsPastResult
        gameResult={gameResult}
        playerId={playerId}
        allPlayers={allPlayers}
      />
    );
  }

  const sortedQuestions = Object.entries(gameResult.questions)
    .map(([id, q]) => ({ id, ...q }))
    .sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));

  if (sortedQuestions.length === 0) return null;

  return (
    <div className="space-y-3">
      {sortedQuestions.map((question) => {
        const qAnswers = gameResult.answers[question.id] || {};
        const myAnswer = qAnswers[playerId];
        const otherAnswers = Object.entries(qAnswers)
          .filter(([pid]) => pid !== playerId)
          .map(([pid, ans]) => ({
            pid,
            name: allPlayers?.[pid]?.name || pid.slice(0, 6),
            text: ans.text,
          }));

        return (
          <div
            key={question.id}
            className="rounded-lg p-4 bg-gray-800/50 border border-gray-700/30"
          >
            <div className="mb-2">
              <p className="text-xs text-purple-400 mb-1">お題</p>
              <p className="text-base text-gray-300 font-bold">{question.text}</p>
            </div>
            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-600 text-white mb-2">
              結果発表
            </span>
            <div className="space-y-1">
              {myAnswer && (
                <div className="bg-green-900/20 border border-green-700/30 rounded p-2">
                  <p className="text-xs text-green-400 mb-0.5">あなたの回答</p>
                  <span className="text-sm text-white">{myAnswer.text}</span>
                </div>
              )}
              {otherAnswers.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {otherAnswers.map((ans) => (
                    <div key={ans.pid} className="p-2 rounded bg-gray-800">
                      <span className="text-xs text-gray-500 mr-2">{ans.name}</span>
                      <span className="text-sm text-white">{ans.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

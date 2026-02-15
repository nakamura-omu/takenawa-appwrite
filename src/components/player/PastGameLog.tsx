"use client";

import { GameResult, Player } from "@/types/room";
import { getBoardLayout, getColorStyle } from "@/lib/deckGenerator";
import { calculateTotalScores, calculateQuestionScores, getStreamsScores } from "@/lib/scoring";
import { ScoreBoard } from "./ScoreBoard";

interface PastGameLogProps {
  gameResult: GameResult;
  playerId: string;
  allPlayers: Record<string, Player> | null;
  tableNumber?: number;
  publishedAssignments?: Record<string, number>;
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
export function PastGameLog({ gameResult, playerId, allPlayers, tableNumber, publishedAssignments }: PastGameLogProps) {
  // スコア計算
  const scores = (() => {
    if (gameResult.type === "krukkurin" || gameResult.type === "meta_streams") {
      return gameResult.boards ? getStreamsScores(gameResult.boards) : gameResult.scores;
    }
    if (gameResult.answers && gameResult.type) {
      return calculateTotalScores(
        gameResult.type,
        gameResult.answers,
        gameResult.scope || "whole",
        gameResult.scope === "table" ? tableNumber : undefined,
        gameResult.scope === "table" ? publishedAssignments : undefined,
      );
    }
    return gameResult.scores;
  })();

  // テーブルスコープの場合、スコアを同卓のみにフィルタ
  const filteredScores = (() => {
    if (!scores || Object.keys(scores).length === 0) return null;
    if (gameResult.scope === "table" && tableNumber && publishedAssignments) {
      return Object.fromEntries(
        Object.entries(scores).filter(([pid]) => publishedAssignments[pid] === tableNumber)
      );
    }
    return scores;
  })();

  // Streams系ゲーム
  if (gameResult.type === "krukkurin" || gameResult.type === "meta_streams") {
    return (
      <>
        <StreamsPastResult
          gameResult={gameResult}
          playerId={playerId}
          allPlayers={allPlayers}
        />
        {filteredScores && Object.keys(filteredScores).length > 0 && (
          <div className="rounded-lg p-4 bg-yellow-900/20 border border-yellow-700/30 mt-3">
            <p className="text-xs text-yellow-400 mb-3 font-semibold">スコアボード</p>
            <ScoreBoard scores={filteredScores} players={allPlayers} myPlayerId={playerId} />
          </div>
        )}
      </>
    );
  }

  const sortedQuestions = Object.entries(gameResult.questions)
    .map(([id, q]) => ({ id, ...q }))
    .sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));

  if (sortedQuestions.length === 0) return null;

  const isGoodLine = gameResult.type === "good_line";
  const isEvens = gameResult.type === "evens";
  const scopeForScoring = gameResult.scope || "whole";

  return (
    <div className="space-y-3">
      {sortedQuestions.map((question) => {
        const qAnswers = gameResult.answers[question.id] || {};

        // スコープに応じた回答フィルタ
        const filteredQAnswers = (() => {
          if (scopeForScoring === "table" && tableNumber && publishedAssignments) {
            return Object.fromEntries(
              Object.entries(qAnswers).filter(([pid]) => publishedAssignments[pid] === tableNumber)
            );
          }
          return qAnswers;
        })();

        // 問題ごとのスコア計算
        const qScores = gameResult.type
          ? calculateQuestionScores(
              gameResult.type,
              qAnswers,
              scopeForScoring,
              scopeForScoring === "table" ? tableNumber : undefined,
              scopeForScoring === "table" ? publishedAssignments : undefined,
            )
          : {};

        const allEntries = Object.entries(filteredQAnswers).map(([pid, ans]) => ({
          pid,
          name: allPlayers?.[pid]?.name || pid.slice(0, 6),
          text: ans.text,
          score: qScores[pid] || 0,
          isMe: pid === playerId,
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

            {isEvens ? (
              /* みんなのイーブン: 票数サマリー付き */
              (() => {
                const yesCount = allEntries.filter(a => a.text === "Yes").length;
                const noCount = allEntries.filter(a => a.text === "No").length;
                const evenCount = allEntries.filter(a => a.text === "Even").length;
                const ratio = Math.max(yesCount, noCount) / Math.max(Math.min(yesCount, noCount), 1);
                const isBalanced = (yesCount + noCount) > 0 && (
                  (yesCount === 0 && noCount === 0) || ratio < 2
                );
                const myEntry = allEntries.find(a => a.isMe);
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-4 p-3 rounded-lg bg-gray-800/80 border border-gray-700/50">
                      <div className="text-center">
                        <span className="block text-lg font-bold text-blue-400">{yesCount}</span>
                        <span className="text-xs text-blue-400/70">Yes</span>
                      </div>
                      <div className="text-gray-600">:</div>
                      <div className="text-center">
                        <span className="block text-lg font-bold text-red-400">{noCount}</span>
                        <span className="text-xs text-red-400/70">No</span>
                      </div>
                      <div className="text-gray-600">:</div>
                      <div className="text-center">
                        <span className="block text-lg font-bold text-yellow-400">{evenCount}</span>
                        <span className="text-xs text-yellow-400/70">Even</span>
                      </div>
                    </div>
                    <div className={`text-center py-2 rounded-lg text-sm font-semibold ${
                      isBalanced
                        ? "bg-yellow-900/20 border border-yellow-700/30 text-yellow-300"
                        : "bg-blue-900/20 border border-blue-700/30 text-blue-300"
                    }`}>
                      {isBalanced
                        ? `均衡！（${yesCount}:${noCount}）→ Even の勝ち！`
                        : `偏り！（${yesCount}:${noCount}）→ ${yesCount > noCount ? "Yes" : "No"} の勝ち！`}
                    </div>
                    {myEntry && (
                      <div className="bg-green-900/20 border border-green-700/30 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-green-400 mb-0.5">あなたの回答</p>
                            <span className="text-sm text-white">{myEntry.text}</span>
                          </div>
                          {myEntry.score > 0 && (
                            <span className="text-xs text-yellow-400 font-semibold shrink-0">+{myEntry.score}pt</span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 他の回答 */}
                    {(() => {
                      const others = allEntries.filter(a => !a.isMe);
                      if (others.length === 0) return null;
                      return (
                        <>
                          <p className="text-xs text-gray-400">
                            {scopeForScoring === "table"
                              ? `テーブルの回答（${allEntries.length}件）`
                              : `みんなの回答（${allEntries.length}件）`}
                          </p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {others.map((ans) => {
                              const choiceColor = ans.text === "Yes" ? "text-blue-400" : ans.text === "No" ? "text-red-400" : "text-yellow-400";
                              return (
                                <div key={ans.pid} className="p-2 rounded bg-gray-800">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-xs text-gray-500 mr-2">{ans.name}</span>
                                      <span className={`text-sm font-semibold ${choiceColor}`}>{ans.text}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              })()
            ) : isGoodLine ? (
              /* いい線行きましょう: 数値ソート一覧 */
              (() => {
                const sorted = [...allEntries].sort(
                  (a, b) => (parseFloat(a.text) || 0) - (parseFloat(b.text) || 0)
                );
                const midIndex = Math.floor((sorted.length - 1) / 2);
                const midIndex2 = sorted.length % 2 === 0 ? midIndex + 1 : midIndex;
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400 mb-1">
                      {scopeForScoring === "table"
                        ? `テーブルの回答（${sorted.length}件）— 真ん中ほど高得点`
                        : `みんなの回答（${sorted.length}件）— 真ん中ほど高得点`}
                    </p>
                    {sorted.map((ans, idx) => {
                      const isMid = idx >= midIndex && idx <= midIndex2;
                      return (
                        <div
                          key={ans.pid}
                          className={`p-2 rounded flex items-center justify-between ${
                            ans.isMe
                              ? "bg-green-900/30 border border-green-700/40"
                              : isMid
                              ? "bg-yellow-900/20 border border-yellow-700/30"
                              : "bg-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-5 text-right tabular-nums">{idx + 1}.</span>
                            <span className={`text-xs ${ans.isMe ? "text-green-400 font-semibold" : "text-gray-400"}`}>
                              {ans.isMe ? `${ans.name}（あなた）` : ans.name}
                            </span>
                            <span className={`text-sm font-bold tabular-nums ${ans.isMe ? "text-green-300" : "text-white"}`}>
                              {ans.text}
                            </span>
                            {isMid && <span className="text-[10px] text-yellow-400">★</span>}
                          </div>
                          {ans.score !== 0 && (
                            <span className={`text-xs font-semibold shrink-0 ${ans.score > 0 ? "text-yellow-400" : "text-red-400"}`}>
                              {ans.score > 0 ? `+${ans.score}` : ans.score}pt
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              /* その他のゲーム: 自分が上、他が下 */
              <div className="space-y-1">
                {allEntries.find(a => a.isMe) && (
                  <div className="bg-green-900/20 border border-green-700/30 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-400 mb-0.5">あなたの回答</p>
                        <span className="text-sm text-white">{allEntries.find(a => a.isMe)!.text}</span>
                      </div>
                      {(qScores[playerId] || 0) > 0 && (
                        <span className="text-xs text-yellow-400 font-semibold shrink-0">+{qScores[playerId]}pt</span>
                      )}
                    </div>
                  </div>
                )}
                {allEntries.filter(a => !a.isMe).length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {allEntries.filter(a => !a.isMe).map((ans) => (
                      <div key={ans.pid} className="p-2 rounded bg-gray-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-gray-500 mr-2">{ans.name}</span>
                            <span className="text-sm text-white">{ans.text}</span>
                          </div>
                          {ans.score > 0 && (
                            <span className="text-xs text-yellow-400 font-semibold shrink-0">+{ans.score}pt</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {/* スコアボード */}
      {filteredScores && Object.keys(filteredScores).length > 0 && (
        <div className="rounded-lg p-4 bg-yellow-900/20 border border-yellow-700/30">
          <p className="text-xs text-yellow-400 mb-3 font-semibold">スコアボード</p>
          <ScoreBoard scores={filteredScores} players={allPlayers} myPlayerId={playerId} />
        </div>
      )}
    </div>
  );
}

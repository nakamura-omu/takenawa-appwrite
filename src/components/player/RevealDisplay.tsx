"use client";

import { Room, Player, StepResponse, GameResult, RevealDisplayType, AnswerRevealScope, GameType, EntryField } from "@/types/room";
import { calculateTotalScores } from "@/lib/scoring";
import { PieChart } from "./PieChart";
import { ScoreBoard } from "./ScoreBoard";

interface RevealDisplayProps {
  room: Room;
  sourceStepIndex: number;
  displayType: RevealDisplayType;
  scope?: AnswerRevealScope;
  playerId: string;
  playerTableNumber: number;
  allPlayers: Record<string, Player> | null;
  revealStepIndex?: number;
  entryFields?: EntryField[];
}

const CHART_COLORS = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#10b981",
  "#ec4899", "#3b82f6", "#f97316", "#14b8a6", "#a855f7",
];

export function RevealDisplay({
  room,
  sourceStepIndex,
  displayType: rawDisplayType,
  scope,
  playerId,
  playerTableNumber,
  allPlayers,
  revealStepIndex,
  entryFields,
}: RevealDisplayProps) {
  const displayType = rawDisplayType || "list"; // フォールバック

  // showInHeader フィールド（名前以外）
  const headerFields = (entryFields || []).filter((f) => f.id !== "name" && f.showInHeader);

  // プレイヤー名 + headerFields のサブテキストを返すヘルパー
  const playerExtra = (pid: string): string | null => {
    if (headerFields.length === 0) return null;
    const p = allPlayers?.[pid];
    if (!p) return null;
    return headerFields.map((f) => `${f.label}：${p.fields?.[f.id] ?? ""}`).join(" / ");
  };

  const sourceStep = room.scenario?.steps?.[sourceStepIndex];
  if (!sourceStep) return <p className="text-sm text-gray-500">参照先ステップが見つかりません</p>;

  // Determine data source
  const isGame = sourceStep.type === "table_game" || sourceStep.type === "whole_game";
  const isSurvey = sourceStep.type === "survey" || sourceStep.type === "survey_open";

  // Game results — Firebase may return array or object for numeric keys, handle all cases
  const rawGameResults = room.gameResults;
  let gameResult: GameResult | undefined;
  if (rawGameResults) {
    gameResult =
      rawGameResults[String(sourceStepIndex)]
      ?? (rawGameResults as unknown as GameResult[])?.[sourceStepIndex]
      ?? (rawGameResults[sourceStepIndex as unknown as string]);
    // Firebase が null を返す場合のガード
    if (gameResult && typeof gameResult !== "object") gameResult = undefined;
  }

  // Survey responses — Firebase may return an array for numeric keys, handle both
  const rawResponses = room.stepResponses?.[String(sourceStepIndex)] ?? room.stepResponses?.[sourceStepIndex as unknown as string];
  const surveyResponses: Record<string, StepResponse> | undefined =
    rawResponses && typeof rawResponses === "object" ? rawResponses : undefined;

  // Filter responses by scope if needed
  const filterByScope = <T extends { tableNumber?: number }>(
    entries: [string, T][],
  ): [string, T][] => {
    if (!scope || scope.type === "all") return entries;
    if (scope.type === "table") {
      return entries.filter(([pid]) => {
        const assignments = room.publishedTables?.assignments;
        if (!assignments) return true;
        return assignments[pid] === playerTableNumber;
      });
    }
    if (scope.type === "players") {
      return entries.filter(([pid]) => scope.playerIds.includes(pid) || pid === playerId);
    }
    return entries;
  };

  // === SCOREBOARD ===
  if (displayType === "scoreboard") {
    if (isGame && gameResult) {
      // スコアが空の場合は answers から再計算
      let scores = gameResult.scores;
      if ((!scores || Object.keys(scores).length === 0) && gameResult.answers && gameResult.type) {
        const assignments = room.publishedTables?.assignments || {};
        const tableNumbers = [...new Set(Object.values(assignments))];
        if (gameResult.scope === "table" && tableNumbers.length > 0) {
          scores = {};
          for (const tNum of tableNumbers) {
            const tableScores = calculateTotalScores(gameResult.type as GameType, gameResult.answers, "table", tNum, assignments);
            Object.entries(tableScores).forEach(([pid, s]) => {
              scores[pid] = (scores[pid] || 0) + s;
            });
          }
        } else {
          scores = calculateTotalScores(gameResult.type as GameType, gameResult.answers, gameResult.scope || "whole");
        }
      }
      if (scores && Object.keys(scores).length > 0) {
        // scope に応じてスコアをフィルタリング
        let filteredScores = scores;
        if (scope?.type === "table") {
          const assignments = room.publishedTables?.assignments;
          if (assignments) {
            filteredScores = Object.fromEntries(
              Object.entries(scores).filter(([pid]) => assignments[pid] === playerTableNumber)
            );
          }
        } else if (scope?.type === "players") {
          filteredScores = Object.fromEntries(
            Object.entries(scores).filter(([pid]) => scope.playerIds.includes(pid) || pid === playerId)
          );
        }
        return (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">スコアボード</h4>
            <ScoreBoard scores={filteredScores} players={allPlayers} myPlayerId={playerId} />
          </div>
        );
      }
    }
    return <p className="text-sm text-gray-500">スコアデータがありません</p>;
  }

  // === LIST ===
  if (displayType === "list") {
    if (isSurvey && surveyResponses) {
      const entries = filterByScope(Object.entries(surveyResponses));
      return (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-400 mb-2">回答一覧</h4>
          {entries.map(([pid, resp]) => {
            const extra = playerExtra(pid);
            return (
              <div
                key={pid}
                className={`flex items-start gap-2 px-3 py-1.5 rounded ${
                  pid === playerId ? "bg-purple-900/30 border border-purple-700/50" : "bg-gray-800/50"
                }`}
              >
                <span className="text-xs text-gray-500 w-20 shrink-0 truncate pt-0.5">
                  {resp.playerName}
                  {extra && <span className="block text-[10px] text-gray-600">{extra}</span>}
                </span>
                <span className="text-sm text-white whitespace-pre-wrap">{String(resp.value)}</span>
              </div>
            );
          })}
        </div>
      );
    }
    if (isGame && gameResult) {
      // Show all answers from all questions
      const allEntries: { pid: string; name: string; text: string; qText: string }[] = [];
      Object.entries(gameResult.questions).forEach(([qId, q]) => {
        const qAnswers = gameResult.answers[qId] || {};
        Object.entries(qAnswers).forEach(([pid, ans]) => {
          allEntries.push({
            pid,
            name: allPlayers?.[pid]?.name || pid.slice(0, 6),
            text: ans.text,
            qText: q.text,
          });
        });
      });
      return (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-400 mb-2">回答一覧</h4>
          {allEntries.map((e, i) => {
            const extra = playerExtra(e.pid);
            return (
              <div key={i} className={`px-3 py-1.5 rounded ${
                e.pid === playerId ? "bg-purple-900/30" : "bg-gray-800/50"
              }`}>
                <span className="text-xs text-gray-500">{e.name}</span>
                {extra && <span className="text-[10px] text-gray-600 ml-1">{extra}</span>}
                <span className="text-sm text-white ml-2">{e.text}</span>
                <span className="text-xs text-gray-600 ml-1">({e.qText})</span>
              </div>
            );
          })}
        </div>
      );
    }
    return <p className="text-sm text-gray-500">データがありません</p>;
  }

  // === BAR CHART ===
  if (displayType === "bar_chart") {
    const counts = getAggregatedCounts(sourceStep, surveyResponses, gameResult, filterByScope);
    if (!counts || counts.length === 0) return <p className="text-sm text-gray-500">データがありません</p>;

    const maxCount = Math.max(...counts.map((c) => c.count));
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 mb-2">集計結果</h4>
        {counts.map((item, i) => {
          const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-300 truncate">{item.label}</span>
                <span className="text-xs text-gray-400 shrink-0 ml-1">{item.count}票</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // === PIE CHART ===
  if (displayType === "pie_chart") {
    const counts = getAggregatedCounts(sourceStep, surveyResponses, gameResult, filterByScope);
    if (!counts || counts.length === 0) return <p className="text-sm text-gray-500">データがありません</p>;

    const pieData = counts.map((c, i) => ({
      label: c.label,
      value: c.count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
    return (
      <div>
        <h4 className="text-xs font-semibold text-gray-400 mb-2">集計結果</h4>
        <PieChart data={pieData} />
      </div>
    );
  }

  // === PER QUESTION ===
  if (displayType === "per_question") {
    // revealStepIndex（このrevealステップ自体のインデックス）で可視状態を取得
    const visKey = revealStepIndex !== undefined ? String(revealStepIndex) : undefined;
    const visMap = visKey ? (room.revealVisibility?.[visKey] || {}) : {};

    // --- ゲームデータ ---
    if (isGame && gameResult) {
      const visibleQuestions = Object.entries(gameResult.questions).filter(
        ([qId]) => visMap[qId] === true,
      );

      if (visibleQuestions.length === 0) {
        return <p className="text-sm text-gray-500">まだ開示されているお題はありません</p>;
      }

      const assignments = room.publishedTables?.assignments || {};

      return (
        <div className="space-y-4">
          {visibleQuestions.map(([qId, q]) => {
            const qAnswers = gameResult.answers?.[qId] || {};
            let answerEntries = Object.entries(qAnswers);

            if (scope?.type === "table") {
              answerEntries = answerEntries.filter(([pid]) => assignments[pid] === playerTableNumber);
            } else if (scope?.type === "players") {
              answerEntries = answerEntries.filter(([pid]) => scope.playerIds.includes(pid) || pid === playerId);
            }

            const scores = gameResult.scores || {};

            return (
              <div key={qId} className="space-y-1.5">
                <h4 className="text-sm font-semibold text-purple-300">{q.text}</h4>
                {answerEntries.map(([pid, ans]) => {
                  const playerName = allPlayers?.[pid]?.name || pid.slice(0, 6);
                  const extra = playerExtra(pid);
                  const score = scores[pid];
                  return (
                    <div
                      key={pid}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded ${
                        pid === playerId ? "bg-purple-900/30 border border-purple-700/50" : "bg-gray-800/50"
                      }`}
                    >
                      <span className="text-xs text-gray-500 w-20 shrink-0 truncate">
                        {playerName}
                        {extra && <span className="block text-[10px] text-gray-600">{extra}</span>}
                      </span>
                      <span className="text-sm text-white flex-1">{ans.text}</span>
                      {score !== undefined && (
                        <span className="text-xs text-yellow-400 shrink-0">{score}pt</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      );
    }

    // --- アンケート（survey_open / survey）データ ---
    if (isSurvey && surveyResponses) {
      // visMap のキーは playerId
      const visibleEntries = filterByScope(Object.entries(surveyResponses)).filter(
        ([pid]) => visMap[pid] === true,
      );

      if (visibleEntries.length === 0) {
        return <p className="text-sm text-gray-500">まだ開示されている回答はありません</p>;
      }

      return (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-400 mb-2">回答開示</h4>
          {visibleEntries.map(([pid, resp]) => {
            const extra = playerExtra(pid);
            return (
              <div
                key={pid}
                className={`flex items-start gap-2 px-3 py-1.5 rounded ${
                  pid === playerId ? "bg-purple-900/30 border border-purple-700/50" : "bg-gray-800/50"
                }`}
              >
                <span className="text-xs text-gray-500 w-20 shrink-0 truncate pt-0.5">
                  {resp.playerName}
                  {extra && <span className="block text-[10px] text-gray-600">{extra}</span>}
                </span>
                <span className="text-sm text-white whitespace-pre-wrap">{String(resp.value)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return <p className="text-sm text-gray-500">データがありません</p>;
  }

  return null;
}

// Helper: Aggregate counts from survey or game data
function getAggregatedCounts(
  sourceStep: { type: string; survey?: { options: string[] } },
  surveyResponses: Record<string, StepResponse> | undefined,
  gameResult: GameResult | undefined,
  filterByScope: <T extends { tableNumber?: number }>(entries: [string, T][]) => [string, T][],
): { label: string; count: number }[] | null {
  if (sourceStep.type === "survey" && surveyResponses) {
    const options = sourceStep.survey?.options || [];
    const filtered = filterByScope(Object.entries(surveyResponses));
    const counts: Record<string, number> = {};
    options.forEach((opt) => { counts[opt] = 0; });
    filtered.forEach(([, resp]) => {
      const val = String(resp.value);
      if (counts[val] !== undefined) counts[val]++;
      else counts[val] = 1;
    });
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }

  if ((sourceStep.type === "table_game" || sourceStep.type === "whole_game") && gameResult) {
    // Aggregate answers across all questions
    const counts: Record<string, number> = {};
    Object.values(gameResult.answers).forEach((qAnswers) => {
      Object.values(qAnswers).forEach((ans) => {
        const val = ans.text.trim();
        counts[val] = (counts[val] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }

  return null;
}

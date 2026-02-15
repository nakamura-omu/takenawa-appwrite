import { GameType, Answer, AnswerRevealScope, PlayerBoard } from "@/types/room";

// Helper: filter answers by scope (table or whole)
function filterAnswersByScope(
  answers: Record<string, Answer>,
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, Answer> {
  if (scope === "whole" || !tableNumber || !assignments) return answers;
  const filtered: Record<string, Answer> = {};
  Object.entries(answers).forEach(([pid, ans]) => {
    if (assignments[pid] === tableNumber) {
      filtered[pid] = ans;
    }
  });
  return filtered;
}

// チューニングガム: 同じ回答の人数分ポイント（自分含む - 1）
// Players who gave the same answer as others get (count of same answers - 1) points
export function calculateTuningGumScores(
  answers: Record<string, Answer>,
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, number> {
  const filtered = filterAnswersByScope(answers, scope, tableNumber, assignments);
  const scores: Record<string, number> = {};

  // Group by answer text (case-insensitive, kana-normalized, trimmed)
  const groups: Record<string, string[]> = {};
  Object.entries(filtered).forEach(([pid, ans]) => {
    const key = ans.text.trim().toLowerCase()
      .replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    if (!groups[key]) groups[key] = [];
    groups[key].push(pid);
  });

  // Each player scores (group size - 1)
  Object.values(groups).forEach((pids) => {
    pids.forEach((pid) => {
      scores[pid] = (scores[pid] || 0) + (pids.length - 1);
    });
  });

  // Players in scope who didn't score get 0
  Object.keys(filtered).forEach((pid) => {
    if (scores[pid] === undefined) scores[pid] = 0;
  });

  return scores;
}

// いい線行きましょう: 数値回答をソートし、中央のランク位置ほど高得点（距離ベース減衰）
// 中央=100pt、端に向かって減衰、両端=-30pt
export function calculateGoodLineScores(
  answers: Record<string, Answer>,
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, number> {
  const filtered = filterAnswersByScope(answers, scope, tableNumber, assignments);
  const scores: Record<string, number> = {};

  const entries = Object.entries(filtered).map(([pid, ans]) => ({
    pid,
    value: parseFloat(ans.text) || 0,
  }));

  const n = entries.length;
  if (n === 0) return scores;

  // 1人の場合は100点
  if (n === 1) {
    scores[entries[0].pid] = 100;
    Object.keys(answers).forEach((pid) => {
      if (scores[pid] === undefined) scores[pid] = 0;
    });
    return scores;
  }

  // 数値でソート
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  const m = (n + 1) / 2; // 中央位置（1-indexed）
  const dMax = m - 1;

  sorted.forEach((entry, idx) => {
    const i = idx + 1; // 1-indexed rank
    const d = Math.abs(i - m);

    if (dMax === 0) {
      // 2人で同値の場合など
      scores[entry.pid] = 100;
    } else if (d >= dMax) {
      scores[entry.pid] = -30; // 両端ペナルティ
    } else {
      scores[entry.pid] = Math.round(100 * (1 - d / dMax));
    }
  });

  // Players in scope who didn't score get 0
  Object.keys(filtered).forEach((pid) => {
    if (scores[pid] === undefined) scores[pid] = 0;
  });

  return scores;
}

// みんなのイーブン: Yes:No の比率。2倍以上離れたら多数派にポイント、均衡ならEvenと答えた人にポイント
// Answers should be "Yes", "No", or "Even"
export function calculateEvensScores(
  answers: Record<string, Answer>,
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, number> {
  const filtered = filterAnswersByScope(answers, scope, tableNumber, assignments);
  const scores: Record<string, number> = {};

  let yesCount = 0;
  let noCount = 0;
  const playerChoices: { pid: string; choice: string }[] = [];

  Object.entries(filtered).forEach(([pid, ans]) => {
    const choice = ans.text.trim();
    playerChoices.push({ pid, choice });
    if (choice === "Yes") yesCount++;
    else if (choice === "No") noCount++;
  });

  // Determine if balanced: ratio < 2x means balanced
  const total = yesCount + noCount;
  const isBalanced = total > 0 && (
    (yesCount === 0 && noCount === 0) ||
    (Math.max(yesCount, noCount) / Math.max(Math.min(yesCount, noCount), 1)) < 2
  );

  if (isBalanced) {
    // Even answers get 1 point
    playerChoices.forEach(({ pid, choice }) => {
      scores[pid] = choice === "Even" ? 1 : 0;
    });
  } else {
    // Majority gets 1 point
    const majority = yesCount > noCount ? "Yes" : "No";
    playerChoices.forEach(({ pid, choice }) => {
      scores[pid] = choice === majority ? 1 : 0;
    });
  }

  // Players in scope who didn't score get 0
  Object.keys(filtered).forEach((pid) => {
    if (scores[pid] === undefined) scores[pid] = 0;
  });

  return scores;
}

// Dispatcher: calculate scores for a single question
export function calculateQuestionScores(
  gameType: GameType,
  answers: Record<string, Answer>,
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, number> {
  switch (gameType) {
    case "tuning_gum":
      return calculateTuningGumScores(answers, scope, tableNumber, assignments);
    case "good_line":
      return calculateGoodLineScores(answers, scope, tableNumber, assignments);
    case "evens":
      return calculateEvensScores(answers, scope, tableNumber, assignments);
    case "krukkurin":
    case "meta_streams":
      // くるっくりん・メタストリームスは配置ゲームのため問題単位のスコアリングなし
      return {};
    default:
      return {};
  }
}

// Streams系ゲーム: boards から累積スコアを取得
export function getStreamsScores(
  boards: Record<string, PlayerBoard>,
): Record<string, number> {
  const scores: Record<string, number> = {};
  Object.entries(boards).forEach(([pid, board]) => {
    scores[pid] = board.score || 0;
  });
  return scores;
}

// Calculate total scores across all questions
export function calculateTotalScores(
  gameType: GameType,
  allAnswers: Record<string, Record<string, Answer>>,  // questionId -> playerId -> Answer
  scope: "table" | "whole",
  tableNumber?: number,
  assignments?: Record<string, number>,
): Record<string, number> {
  const totals: Record<string, number> = {};

  Object.values(allAnswers).forEach((questionAnswers) => {
    const questionScores = calculateQuestionScores(gameType, questionAnswers, scope, tableNumber, assignments);
    Object.entries(questionScores).forEach(([pid, score]) => {
      totals[pid] = (totals[pid] || 0) + score;
    });
  });

  return totals;
}

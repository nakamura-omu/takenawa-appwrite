"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Room, Answer, Question, AnswerRevealScope, Player } from "@/types/room";
import { ref, set } from "firebase/database";
import { getDb } from "@/lib/firebase";
import { calculateQuestionScores, calculateTotalScores } from "@/lib/scoring";
import { ScoreBoard } from "./ScoreBoard";

gsap.registerPlugin(useGSAP);

interface GameQuestionProps {
  roomId: string;
  room: Room;
  playerId: string;
  playerName: string;
  tableNumber: number;
  allPlayers?: Record<string, Player> | null;
  stepGameType?: import("@/types/room").GameType;
}

// 回答を送信（questionId対応）
async function submitAnswer(
  roomId: string,
  questionId: string,
  playerId: string,
  text: string
): Promise<void> {
  const answerRef = ref(getDb(), `rooms/${roomId}/currentGame/answers/${questionId}/${playerId}`);
  const answer: Answer = {
    text,
    submittedAt: Date.now(),
  };
  await set(answerRef, answer);
}

export function GameQuestion({
  roomId,
  room,
  playerId,
  tableNumber,
  allPlayers,
  stepGameType,
}: GameQuestionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // showScores removed — scoreboard visibility is admin-controlled

  const currentGame = room.currentGame;
  const questions = currentGame?.questions || {};
  const answers = currentGame?.answers || {};
  const activeQuestionId = currentGame?.activeQuestionId;
  const publishedAssignments = room.publishedTables?.assignments;
  const scope = currentGame?.scope || "whole";
  const anonymousMode = currentGame?.anonymousMode;

  // 質問を時系列でソート（古い順＝ログ順、上→下に流れる）
  const sortedQuestions = Object.entries(questions)
    .map(([id, q]) => ({ id, ...q }))
    .sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));

  // revealed 問題数チェック
  const revealedCount = sortedQuestions.filter((q) => q.status === "revealed").length;
  const allRevealed = sortedQuestions.length > 0 && revealedCount === sortedQuestions.length;

  // 累積スコア計算（1問でも revealed があれば計算）
  const resolvedGameType = currentGame?.type || stepGameType;
  const totalScores = (resolvedGameType && revealedCount > 0)
    ? calculateTotalScores(
        resolvedGameType,
        answers,
        scope,
        scope === "table" ? tableNumber : undefined,
        scope === "table" ? publishedAssignments : undefined,
      )
    : null;

  if (sortedQuestions.length === 0) return null;

  return (
    <div ref={containerRef} className="space-y-3">
      {sortedQuestions.map((question) => (
        <QuestionCard
          key={question.id}
          roomId={roomId}
          questionId={question.id}
          question={question}
          answers={answers[question.id] || {}}
          playerId={playerId}
          isActive={question.id === activeQuestionId}
          tableNumber={tableNumber}
          publishedAssignments={publishedAssignments}
          scope={scope}
          anonymousMode={anonymousMode}
          gameType={resolvedGameType}
          allPlayers={allPlayers}
        />
      ))}
      {/* スコアボード（管理者トグルで制御） */}
      {totalScores && Object.keys(totalScores).length > 0 && currentGame?.showScoreboard && (
        <div className="rounded-lg p-4 bg-yellow-900/20 border border-yellow-700/30 animate-panel-in">
          <p className="text-xs text-yellow-400 mb-3 font-semibold">
            {allRevealed ? "スコアボード" : `途中経過（${revealedCount}/${sortedQuestions.length}問）`}
          </p>
          <ScoreBoard scores={totalScores} players={allPlayers || room.players || null} myPlayerId={playerId} celebrate={allRevealed} />
        </div>
      )}
    </div>
  );
}

// スコープに基づいた回答フィルタ
function filterAnswersByScope(
  answers: { playerId: string; text: string; submittedAt: number }[],
  scope: AnswerRevealScope | undefined,
  myPlayerId: string,
  myTableNumber: number,
  publishedAssignments?: Record<string, number>,
): { playerId: string; text: string; submittedAt: number }[] {
  if (!scope || scope.type === "all") return answers;

  if (scope.type === "table") {
    return answers.filter((ans) => {
      if (ans.playerId === myPlayerId) return true; // 自分の回答は常に見える
      if (!publishedAssignments) return false;
      return publishedAssignments[ans.playerId] === myTableNumber;
    });
  }

  if (scope.type === "players") {
    return answers.filter((ans) => {
      if (ans.playerId === myPlayerId) return true;
      return scope.playerIds.includes(ans.playerId);
    });
  }

  return answers;
}

// 個別のお題カード
interface QuestionCardProps {
  roomId: string;
  questionId: string;
  question: Question & { id: string };
  answers: Record<string, Answer>;
  playerId: string;
  isActive: boolean;
  tableNumber: number;
  publishedAssignments?: Record<string, number>;
  scope?: "table" | "whole";
  anonymousMode?: boolean;
  gameType?: string;
  allPlayers?: Record<string, Player> | null;
}

function QuestionCard({
  roomId,
  questionId,
  question,
  answers,
  playerId,
  isActive,
  tableNumber,
  publishedAssignments,
  scope,
  anonymousMode,
  gameType,
  allPlayers,
}: QuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [answerText, setAnswerText] = useState("");
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  // 質問が変わったらリセット
  useEffect(() => {
    setHasAnimated(false);
    setAnswerText("");
    setSelectedOption("");
  }, [question.text]);

  // 既存の回答を確認
  const myAnswer = answers[playerId];
  const hasAnswered = !!myAnswer;

  // すべての回答
  const allAnswers = Object.entries(answers).map(([pid, ans]) => ({
    playerId: pid,
    ...ans,
  }));

  // スコープフィルタ適用後の回答
  const visibleAnswers = filterAnswersByScope(
    allAnswers,
    question.revealScope,
    playerId,
    tableNumber,
    publishedAssignments,
  );

  const handleSubmit = async () => {
    const inputType = question.inputType || "text";
    let value = "";

    if (inputType === "select") {
      if (!selectedOption) return;
      value = selectedOption;
    } else {
      if (!answerText.trim()) return;
      value = answerText.trim();
    }

    if (submitting || hasAnswered) return;

    setSubmitting(true);
    await submitAnswer(roomId, questionId, playerId, value);
    setSubmitting(false);
    setAnswerText("");
    setSelectedOption("");
  };

  // GSAPアニメーション（revealed時）
  useGSAP(
    () => {
      if (!cardRef.current || question.status !== "revealed" || hasAnimated) return;

      const tl = gsap.timeline({
        onComplete: () => setHasAnimated(true),
      });

      tl.from(cardRef.current.querySelectorAll(".game-answer-item"), {
        opacity: 0,
        y: 10,
        duration: 0.4,
        stagger: 0.1,
        ease: "power2.out",
      });
    },
    { scope: cardRef, dependencies: [question.status, allAnswers.length] }
  );

  const inputType = question.inputType || "text";
  const options = question.options || [];

  return (
    <div
      ref={cardRef}
      className={`rounded-lg p-4 animate-panel-in ${
        isActive
          ? "bg-purple-900/20 border border-purple-700/30"
          : "bg-gray-800/50 border border-gray-700/30"
      }`}
    >
      {/* お題 */}
      <div className="mb-3">
        <p className="text-xs text-purple-400 mb-1">お題</p>
        <p className={`font-bold ${isActive ? "text-lg text-white" : "text-base text-gray-300"}`}>
          {question.text}
        </p>
      </div>

      {/* ステータス表示 */}
      <div className="mb-3">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
            question.status === "open"
              ? "bg-green-600 text-white"
              : question.status === "closed"
              ? "bg-yellow-600 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          {question.status === "open"
            ? "回答受付中"
            : question.status === "closed"
            ? "回答締切"
            : "結果発表"}
        </span>
      </div>

      {/* 回答入力（open時のみ、未回答時のみ） */}
      {question.status === "open" && !hasAnswered && (
        <div className="space-y-2">
          {/* テキスト入力 */}
          {inputType === "text" && (
            <>
              <input
                type="text"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="回答を入力..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-purple-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
              <p className="text-xs text-gray-500">※ 回答はひらがなで入力してください</p>
            </>
          )}

          {/* 数値入力 */}
          {inputType === "number" && (
            <input
              type="number"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="数値を入力..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-purple-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          )}

          {/* 選択肢 */}
          {inputType === "select" && options.length > 0 && (
            <div className="space-y-2">
              {options.filter(o => o.trim()).map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition ${
                    selectedOption === opt
                      ? "bg-purple-900/50 border-purple-500"
                      : "bg-gray-800 border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name={`game-option-${questionId}`}
                    value={opt}
                    checked={selectedOption === opt}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    className="text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-white">{opt}</span>
                </label>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (inputType === "select" ? !selectedOption : !answerText.trim())
            }
            className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded font-semibold transition"
          >
            {submitting ? "送信中..." : "回答する"}
          </button>
        </div>
      )}

      {/* 回答済み表示（結果発表前） */}
      {hasAnswered && question.status !== "revealed" && (
        <div className="bg-green-900/20 border border-green-700/30 rounded p-3">
          <p className="text-xs text-green-400 mb-1">あなたの回答</p>
          <p className="text-sm text-white">{myAnswer.text}</p>
        </div>
      )}

      {/* 締切後・待機中 */}
      {question.status === "closed" && !hasAnswered && (
        <p className="text-sm text-yellow-400">回答は締め切られました</p>
      )}

      {/* 結果発表 */}
      {question.status === "revealed" && (() => {
        // 問題ごとのスコア計算
        const questionScores = gameType
          ? calculateQuestionScores(
              gameType as import("@/types/room").GameType,
              answers,
              scope || "whole",
              scope === "table" ? tableNumber : undefined,
              scope === "table" ? publishedAssignments : undefined,
            )
          : {};

        // 匿名モード: シャッフル表示
        const displayAnswers = anonymousMode
          ? [...visibleAnswers].sort(() => Math.random() - 0.5)
          : visibleAnswers;

        const myDisplayAnswer = displayAnswers.find((a) => a.playerId === playerId);
        const othersAnswers = displayAnswers.filter((a) => a.playerId !== playerId);
        const myScore = myDisplayAnswer ? (questionScores[playerId] || 0) : 0;

        return (
          <div className="space-y-2">
            {/* あなたの回答（常に一番上） */}
            {myDisplayAnswer && (
              <div className="game-answer-item bg-green-900/20 border border-green-700/30 rounded p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-400 mb-1">あなたの回答</p>
                    <span className="text-sm text-white">{myDisplayAnswer.text}</span>
                  </div>
                  {myScore > 0 && (
                    <span className="text-xs text-yellow-400 font-semibold shrink-0">+{myScore}pt</span>
                  )}
                </div>
              </div>
            )}
            {/* 他の回答 */}
            <p className="text-xs text-gray-400">
              {question.revealScope?.type === "table" || scope === "table"
                ? `テーブルの回答（${displayAnswers.length}件）`
                : `みんなの回答（${displayAnswers.length}件）`}
            </p>
            {othersAnswers.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {othersAnswers.map((ans) => {
                  const playerScore = questionScores[ans.playerId] || 0;
                  const playerName = anonymousMode ? "???" : (allPlayers?.[ans.playerId]?.name || "");
                  return (
                    <div key={ans.playerId} className="game-answer-item p-2 rounded bg-gray-800">
                      <div className="flex items-center justify-between">
                        <div>
                          {!anonymousMode && playerName && (
                            <span className="text-xs text-gray-500 mr-2">{playerName}</span>
                          )}
                          <span className="text-sm text-white">{ans.text}</span>
                        </div>
                        {playerScore > 0 && (
                          <span className="text-xs text-yellow-400 font-semibold shrink-0">+{playerScore}pt</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              !myDisplayAnswer && <p className="text-sm text-gray-500">回答がありません</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

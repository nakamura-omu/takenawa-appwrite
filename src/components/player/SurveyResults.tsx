"use client";

import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Room, StepInputReveal } from "@/types/room";

// GSAPプラグイン登録
gsap.registerPlugin(useGSAP);

interface SurveyResultsProps {
  room: Room;
  questionStepIndex: number;
  playerTableNumber: number;
  playerId: string;
}

// アンケート結果の視覚的表示（GSAPアニメーション付き）
export function SurveyResults({
  room,
  questionStepIndex,
  playerTableNumber,
  playerId,
}: SurveyResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  const steps = room.scenario?.steps || [];
  const questionStep = steps[questionStepIndex];

  if (!questionStep?.survey) return null;

  const { question, options, allowMultiple } = questionStep.survey;
  const reveal = room.stepReveals?.[String(questionStepIndex)];

  // 開示設定がない場合は表示しない
  if (!reveal || reveal.mode === "admin_only") {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-400">結果はまだ公開されていません</p>
      </div>
    );
  }

  const responses = room.stepResponses?.[String(questionStepIndex)];
  if (!responses) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-400">まだ回答がありません</p>
      </div>
    );
  }

  // フィルタリング（同テーブルのみの場合）
  let filteredResponses = Object.entries(responses);
  if (reveal.target === "same_table") {
    filteredResponses = filteredResponses.filter(
      ([, r]) => r.tableNumber === playerTableNumber
    );
  }

  // 各選択肢の集計
  const counts: Record<string, { count: number; names: string[] }> = {};
  options.forEach((opt) => {
    counts[opt] = { count: 0, names: [] };
  });

  filteredResponses.forEach(([, resp]) => {
    const value = resp.value;
    let selectedOptions: string[] = [];
    if (allowMultiple && typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          selectedOptions = parsed;
        }
      } catch {
        selectedOptions = [value];
      }
    } else {
      selectedOptions = [String(value)];
    }

    selectedOptions.forEach((opt) => {
      if (counts[opt]) {
        counts[opt].count++;
        counts[opt].names.push(resp.playerName);
      }
    });
  });

  const totalResponses = filteredResponses.length;
  const maxCount = Math.max(...options.map((opt) => counts[opt].count), 1);

  // 結果データを配列に
  const results = options.map((option) => {
    const { count, names } = counts[option];
    const percentage = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0;
    const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
    return { option, count, names, percentage, barWidth };
  });

  // 1位を特定
  const maxVotes = Math.max(...results.map((r) => r.count));
  const winners = results.filter((r) => r.count === maxVotes && r.count > 0);

  // GSAPアニメーション
  useGSAP(
    () => {
      if (hasAnimated || !containerRef.current) return;

      const tl = gsap.timeline({
        onComplete: () => setHasAnimated(true),
      });

      // 質問文フェードイン
      tl.from(".survey-question", {
        opacity: 0,
        y: -10,
        duration: 0.4,
        ease: "power2.out",
      });

      // バーを順番にアニメーション
      tl.from(
        ".survey-bar-fill",
        {
          width: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: "power2.out",
        },
        "-=0.2"
      );

      // 数字をカウントアップ
      const countElements = containerRef.current.querySelectorAll(".survey-count");
      countElements.forEach((el, i) => {
        const target = results[i]?.count || 0;
        tl.from(
          el,
          {
            textContent: 0,
            duration: 0.6,
            snap: { textContent: 1 },
            ease: "power1.out",
          },
          "-=0.7"
        );
      });

      // パーセンテージをカウントアップ
      const percentElements = containerRef.current.querySelectorAll(".survey-percent");
      percentElements.forEach((el, i) => {
        const target = results[i]?.percentage || 0;
        tl.from(
          el,
          {
            textContent: 0,
            duration: 0.6,
            snap: { textContent: 1 },
            ease: "power1.out",
          },
          "<"
        );
      });

      // 1位にハイライトエフェクト
      if (winners.length > 0) {
        tl.to(
          ".survey-winner",
          {
            scale: 1.02,
            duration: 0.2,
            ease: "power2.out",
          },
          "-=0.2"
        );
        tl.to(".survey-winner", {
          scale: 1,
          duration: 0.15,
          ease: "power2.in",
        });
      }

      // 名前表示（named モードの場合）
      tl.from(
        ".survey-names",
        {
          opacity: 0,
          y: 5,
          duration: 0.3,
          stagger: 0.08,
          ease: "power2.out",
        },
        "-=0.3"
      );
    },
    { scope: containerRef, dependencies: [reveal, totalResponses] }
  );

  return (
    <div ref={containerRef} className="bg-gray-800/50 rounded-lg p-4">
      <p className="survey-question text-sm font-medium text-gray-300 mb-4">
        {question}
      </p>

      <div className="space-y-3">
        {results.map((result, i) => {
          const isWinner = winners.some((w) => w.option === result.option) && result.count > 0;

          return (
            <div
              key={result.option}
              className={`survey-item ${isWinner ? "survey-winner" : ""}`}
            >
              {/* オプションラベルと数値 */}
              <div className="flex justify-between items-center mb-1">
                <span className={`text-sm ${isWinner ? "text-yellow-300 font-semibold" : "text-gray-200"}`}>
                  {isWinner && <span className="mr-1">👑</span>}
                  {result.option}
                </span>
                <span className="text-sm text-gray-400">
                  <span className="survey-count">{result.count}</span>人 (
                  <span className="survey-percent">{result.percentage}</span>%)
                </span>
              </div>

              {/* バー */}
              <div className="h-8 bg-gray-700 rounded overflow-hidden relative">
                <div
                  className={`survey-bar-fill h-full transition-colors ${
                    isWinner
                      ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                      : "bg-gradient-to-r from-blue-500 to-blue-600"
                  }`}
                  style={{ width: `${result.barWidth}%` }}
                />
                {/* バー内のパーセンテージ */}
                {result.barWidth > 15 && (
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow">
                    {result.percentage}%
                  </span>
                )}
              </div>

              {/* 名前表示（named モードの場合） */}
              {reveal.mode === "named" && result.names.length > 0 && (
                <p className="survey-names text-xs text-gray-500 mt-1 truncate">
                  {result.names.join("、")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 回答者数 */}
      <p className="text-xs text-gray-500 mt-4 text-right">
        回答: {totalResponses}人
        {reveal.target === "same_table" && " (同テーブル)"}
      </p>
    </div>
  );
}

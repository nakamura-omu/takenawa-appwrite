"use client";

import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
import confetti from "canvas-confetti";
import { Player, ScenarioStep, TimelineSnapshot } from "@/types/room";
import { GAME_RULES } from "@/lib/gameRules";
import { TableBadge } from "./TableBadge";

// ステップタイプ別アナウンスカラー
function announceColorClass(type: string): string {
  switch (type) {
    case "table_game":
      return "bg-emerald-900/30 border-emerald-700/50 text-emerald-300";
    case "whole_game":
      return "bg-purple-900/30 border-purple-700/50 text-purple-300";
    case "break":
      return "bg-amber-900/30 border-amber-700/50 text-amber-300";
    case "entry":
      return "bg-blue-900/30 border-blue-700/50 text-blue-300";
    case "end":
      return "bg-rose-900/30 border-rose-700/50 text-rose-300";
    default:
      return "bg-gray-800/50 border-gray-700/50 text-gray-300";
  }
}

// タイムラインカード
export function TimelineCard({
  stepIndex,
  step,
  player,
  snapshot,
  prevSnapshot,
  isCurrent,
  publishedTableNumber,
  timestamp,
}: {
  stepIndex: number;
  step: ScenarioStep;
  player: Player;
  snapshot?: TimelineSnapshot;
  prevSnapshot?: TimelineSnapshot;
  isCurrent: boolean;
  publishedTableNumber?: number;
  timestamp?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const [showRules, setShowRules] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // 現在ステップの経過時間をリアルタイム更新
  useEffect(() => {
    if (!isCurrent || !timestamp) return;
    const tick = () => setElapsedSec(Math.floor((Date.now() - timestamp) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isCurrent, timestamp]);

  const isEndCeremony = step.type === "end" && isCurrent;

  // GSAP入場アニメーション（現在ステップのみ）
  useEffect(() => {
    if (!isCurrent || hasAnimated.current || !cardRef.current) return;
    hasAnimated.current = true;

    // --- 閉会演出 ---
    if (isEndCeremony) {
      const tl = gsap.timeline();
      // カード全体: フェードイン
      tl.from(cardRef.current, {
        opacity: 0, scale: 0.8, duration: 0.6, ease: "power3.out",
      });
      // "閉　会" の各文字を順番にドロップイン
      const chars = cardRef.current.querySelectorAll(".end-char");
      tl.from(chars, {
        opacity: 0, y: -40, scale: 1.5, rotateX: 90,
        duration: 0.5, stagger: 0.2, ease: "back.out(2)",
      }, "-=0.2");
      // グロー膨張
      tl.to(cardRef.current, {
        boxShadow: "0 0 40px rgba(244,63,94,0.5), 0 0 80px rgba(244,63,94,0.2)",
        duration: 0.4, ease: "power2.out",
      }, "-=0.3");
      tl.to(cardRef.current, {
        boxShadow: "0 0 16px rgba(244,63,94,0.3), 0 0 40px rgba(244,63,94,0.1)",
        duration: 1.0, ease: "power2.inOut",
      });
      // サブテキスト
      const sub = cardRef.current.querySelector(".end-sub");
      if (sub) {
        tl.from(sub, { opacity: 0, y: 10, duration: 0.5, ease: "power2.out" }, "-=0.8");
      }
      // アナウンスメッセージ
      const msg = cardRef.current.querySelector(".step-announce");
      if (msg) {
        tl.from(msg, { opacity: 0, y: 10, duration: 0.4, ease: "power2.out" }, "-=0.3");
      }
      // 花火エフェクト（結果発表の紙吹雪とは差別化）
      const fire = (opts: confetti.Options) =>
        confetti({ ...opts, disableForReducedMotion: true });
      const fireworkColors = ["#fbbf24", "#f59e0b", "#f43f5e", "#ec4899", "#a78bfa"];
      // 第1波: 中央から花火風（高速で打ち上がって散る）
      setTimeout(() => {
        fire({
          particleCount: 50, startVelocity: 55, spread: 360,
          origin: { x: 0.5, y: 0.35 }, gravity: 0.8, ticks: 200,
          colors: fireworkColors, shapes: ["star", "circle"], scalar: 1.2,
        });
      }, 400);
      // 第2波: 左右から花火
      setTimeout(() => {
        fire({
          particleCount: 35, startVelocity: 45, spread: 120, angle: 45,
          origin: { x: 0.15, y: 0.5 }, gravity: 0.7, ticks: 180,
          colors: ["#fbbf24", "#f59e0b", "#fde68a"], shapes: ["star"], scalar: 1.4,
        });
        fire({
          particleCount: 35, startVelocity: 45, spread: 120, angle: 135,
          origin: { x: 0.85, y: 0.5 }, gravity: 0.7, ticks: 180,
          colors: ["#f43f5e", "#ec4899", "#fda4af"], shapes: ["star"], scalar: 1.4,
        });
      }, 900);
      // 第3波: 上から金の雨
      setTimeout(() => {
        fire({
          particleCount: 80, startVelocity: 15, spread: 160, angle: 270,
          origin: { x: 0.5, y: -0.1 }, gravity: 1.2, ticks: 300, drift: 0,
          colors: ["#fbbf24", "#fde68a", "#fffbeb"], shapes: ["circle"], scalar: 0.8,
        });
      }, 1500);
      // 第4波: フィナーレ大爆発
      setTimeout(() => {
        fire({
          particleCount: 70, startVelocity: 60, spread: 360,
          origin: { x: 0.3, y: 0.4 }, gravity: 0.6, ticks: 250,
          colors: fireworkColors, shapes: ["star", "circle"], scalar: 1.0,
        });
        fire({
          particleCount: 70, startVelocity: 60, spread: 360,
          origin: { x: 0.7, y: 0.4 }, gravity: 0.6, ticks: 250,
          colors: fireworkColors, shapes: ["star", "circle"], scalar: 1.0,
        });
      }, 2200);
      return;
    }

    // --- 通常ステップ演出 ---
    const tl = gsap.timeline();
    // カード: スケール + バウンス
    tl.from(cardRef.current, {
      opacity: 0, scale: 0.85, y: 20,
      duration: 0.5, ease: "back.out(1.7)",
    });
    // グロー発光 → 定常へ
    tl.to(cardRef.current, {
      boxShadow: "0 0 24px rgba(34,197,94,0.4)",
      duration: 0.3, ease: "power2.out",
    }, "-=0.15");
    tl.to(cardRef.current, {
      boxShadow: "0 0 8px rgba(34,197,94,0.15)",
      duration: 0.8, ease: "power2.inOut",
    });
    // アナウンスメッセージ（あれば）
    const msg = cardRef.current.querySelector(".step-announce");
    if (msg) {
      tl.from(msg, {
        opacity: 0, y: 10, scale: 0.95,
        duration: 0.4, ease: "power2.out",
      }, "-=0.5");
    }
  }, [isCurrent, isEndCeremony]);

  // 現在のステップはpublishedTableNumberを使用、過去のステップはスナップショット
  const tableNum = isCurrent
    ? (publishedTableNumber ?? player.tableNumber)
    : (snapshot?.tableNumber ?? player.tableNumber);

  // テーブルが前のステップから変わったか
  const tableChanged = prevSnapshot && prevSnapshot.tableNumber > 0 && tableNum > 0 && tableNum !== prevSnapshot.tableNumber;

  // ゲームルール
  const gameRule = step.gameType ? GAME_RULES[step.gameType] : null;

  return (
    <div className="relative pl-6 pb-6">
      {/* タイムラインの縦線 */}
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700" />
      {/* ドット */}
      <div className={`absolute rounded-full border-2 border-gray-950 ${
        isEndCeremony
          ? "left-0 top-1 w-4 h-4 bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]"
          : isCurrent
          ? "left-0 top-1 w-4 h-4 bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"
          : "left-0.5 top-1.5 w-3 h-3 bg-gray-500"
      }`} />

      <div ref={cardRef} className={`rounded-lg border ${
        isEndCeremony
          ? "p-6 bg-gradient-to-b from-rose-950/60 via-gray-900 to-gray-900 border-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.3)]"
          : isCurrent
          ? "p-4 bg-green-950/40 border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.25)]"
          : "p-4 bg-gray-900 border-gray-800"
      }`}>
        {/* === 閉会演出 === */}
        {isEndCeremony ? (
          <>
            <div className="text-center py-4">
              <div className="flex justify-center gap-3 mb-3">
                {"閉　会".split("").map((char, i) => (
                  <span
                    key={i}
                    className="end-char inline-block text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-rose-300 via-rose-400 to-rose-600"
                    style={{ textShadow: "0 0 30px rgba(244,63,94,0.4)" }}
                  >
                    {char}
                  </span>
                ))}
              </div>
              <p className="end-sub text-sm text-rose-300/80">
                ご参加ありがとうございました
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isCurrent && (
                  <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded tracking-wide">NOW</span>
                )}
                <p className={`text-sm font-semibold ${isCurrent ? "text-green-300" : "text-gray-400"}`}>
                  Step {stepIndex + 1}: {step.label}
                </p>
              </div>
              {timestamp && (
                <span className="text-[10px] text-gray-600">
                  {new Date(timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            {/* 時間表示（durationMinutes が設定されている場合） */}
            {step.durationMinutes && timestamp && (
              <div className="mb-2">
                {isCurrent ? (() => {
                  const elMin = Math.floor(elapsedSec / 60);
                  const elSec = elapsedSec % 60;
                  const over = elapsedSec > step.durationMinutes * 60;
                  return (
                    <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-gray-400"}`}>
                      経過 {elMin}:{String(elSec).padStart(2, "0")} / 予定 {step.durationMinutes}分
                    </span>
                  );
                })() : (
                  <span className="text-xs text-gray-500 tabular-nums">
                    予定 {step.durationMinutes}分
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* テーブル変更通知 */}
        {tableChanged && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 mb-2 text-center">
            <p className="text-xs text-yellow-400">テーブルが変わりました</p>
            <p className="text-sm font-bold text-yellow-300">テーブル {prevSnapshot.tableNumber} → {tableNum}</p>
          </div>
        )}

        {/* テーブル番号（entryステップ） */}
        {step.type === "entry" && (
          <div className="mb-2">
            <TableBadge tableNum={tableNum} />
          </div>
        )}

        {/* アナウンスメッセージ */}
        {step.display?.message && (
          <div className={`step-announce mt-3 rounded-lg p-3 border text-sm font-medium whitespace-pre-wrap ${announceColorClass(step.type)}`}>
            {step.display.message}
          </div>
        )}

        {/* ゲームルール折りたたみ（ゲーム系ステップのみ） */}
        {gameRule && (step.type === "table_game" || step.type === "whole_game") && (
          <div className="mt-2">
            <button onClick={() => setShowRules(!showRules)}
              className="text-xs text-gray-400 hover:text-gray-300 transition">
              {gameRule.title}：ルール {showRules ? "▲" : "▼"}
            </button>
            {showRules && (
              <div className="mt-1.5 p-3 bg-gray-800/70 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {gameRule.rules}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import confetti from "canvas-confetti";
import { Player } from "@/types/room";

interface ScoreBoardProps {
  scores: Record<string, number>;
  players: Record<string, Player> | null;
  myPlayerId?: string;
  celebrate?: boolean;
}

export function ScoreBoard({ scores, players, myPlayerId, celebrate }: ScoreBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayScores, setDisplayScores] = useState<Record<string, number>>({});
  const hasPlayedEntry = useRef(false);

  // Sort by score descending (players が null なら全員表示)
  const ranked = Object.entries(scores || {})
    .filter(([pid]) => !players || players[pid])
    .sort((a, b) => b[1] - a[1])
    .map(([pid, score], idx) => {
      return { pid, score, rank: idx + 1 };
    });

  // Fix rank calculation (handle ties properly)
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].score === ranked[i - 1].score) {
      ranked[i].rank = ranked[i - 1].rank;
    } else {
      ranked[i].rank = i + 1;
    }
  }

  // スコアの内容が変わったら再アニメーションするためのキー
  const scoreKey = ranked.map(r => `${r.pid}:${r.score}`).join(",");

  useEffect(() => {
    if (!containerRef.current || ranked.length === 0) return;

    // Initialize display scores to 0
    const initial: Record<string, number> = {};
    ranked.forEach(({ pid }) => { initial[pid] = 0; });
    setDisplayScores(initial);

    // 登場アニメーション・紙吹雪は初回のみ
    if (!hasPlayedEntry.current) {
      hasPlayedEntry.current = true;

      // Confetti celebration
      if (celebrate) {
        const fire = (opts: confetti.Options) =>
          confetti({ ...opts, disableForReducedMotion: true });
        fire({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
        fire({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
        setTimeout(() => {
          fire({ particleCount: 50, angle: 90, spread: 100, origin: { x: 0.5, y: 0.5 } });
        }, 400);
        setTimeout(() => {
          fire({ particleCount: 30, angle: 60, spread: 60, origin: { x: 0.2, y: 0.6 } });
          fire({ particleCount: 30, angle: 120, spread: 60, origin: { x: 0.8, y: 0.6 } });
        }, 800);
      }

      if (celebrate) {
        // Final mode: top 3 podium drops in big, then rest slides in
        const podiums = containerRef.current.querySelectorAll(".podium-card");
        const rows = containerRef.current.querySelectorAll(".score-row");
        gsap.from(podiums, {
          opacity: 0,
          scale: 0.3,
          y: -30,
          duration: 0.6,
          stagger: 0.15,
          ease: "back.out(1.4)",
        });
        if (rows.length > 0) {
          gsap.from(rows, {
            opacity: 0,
            x: -20,
            duration: 0.4,
            stagger: 0.06,
            delay: 0.5,
            ease: "power2.out",
          });
        }
      } else {
        // Compact mode: simple slide in
        const rows = containerRef.current.querySelectorAll(".score-row");
        gsap.from(rows, {
          opacity: 0,
          x: -20,
          duration: 0.4,
          stagger: 0.08,
          ease: "power2.out",
        });
      }
    }

    // Count up scores（スコアが変わるたびに再実行）
    ranked.forEach(({ pid, score }) => {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: score,
        duration: celebrate ? 1.8 : 1.2,
        delay: celebrate ? 0.5 : 0.3,
        ease: "power2.out",
        onUpdate: () => {
          setDisplayScores((prev) => ({ ...prev, [pid]: Math.round(obj.val) }));
        },
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreKey]);

  if (ranked.length === 0) {
    return <p className="text-sm text-gray-500">スコアデータがありません</p>;
  }

  // --- Final (celebrate) mode ---
  if (celebrate) {
    const top3 = ranked.filter((r) => r.rank <= 3);
    const rest = ranked.filter((r) => r.rank > 3);

    return (
      <div ref={containerRef} className="space-y-3">
        {/* Top 3 podium cards */}
        <div className="space-y-2">
          {top3.map(({ pid, score, rank }) => {
            const player = players?.[pid];
            const isMe = pid === myPlayerId;
            const displayed = displayScores[pid] ?? score;
            return (
              <div
                key={pid}
                className={`podium-card relative overflow-hidden rounded-xl cursor-pointer select-none ${
                  rank === 1
                    ? "py-5 px-4 bg-gradient-to-r from-yellow-900/40 via-yellow-800/30 to-yellow-900/40 border-2 border-yellow-600/60"
                    : rank === 2
                    ? "py-4 px-4 bg-gradient-to-r from-gray-700/40 via-gray-600/30 to-gray-700/40 border border-gray-500/50"
                    : "py-3 px-4 bg-gradient-to-r from-amber-900/30 via-amber-800/20 to-amber-900/30 border border-amber-700/40"
                }`}
                onClick={(e) => {
                  const el = e.currentTarget;
                  gsap.fromTo(el,
                    { scale: 1 },
                    { scale: 1.05, duration: 0.12, yoyo: true, repeat: 3, ease: "power1.inOut" }
                  );
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={rank === 1 ? "text-3xl" : "text-2xl"}>
                    {rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate ${
                      rank === 1 ? "text-lg text-yellow-300" : "text-base text-gray-200"
                    }`}>
                      {player?.name || pid.slice(0, 6)}
                      {isMe && <span className="text-purple-400 text-sm ml-1.5">YOU</span>}
                    </p>
                  </div>
                  <span className={`font-black tabular-nums ${
                    rank === 1
                      ? "text-3xl text-yellow-400"
                      : rank === 2
                      ? "text-2xl text-gray-200"
                      : "text-2xl text-amber-500"
                  }`}>
                    {displayed}<span className="text-xs font-semibold ml-0.5 opacity-70">pt</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4th place and below - compact */}
        {rest.length > 0 && (
          <div className="space-y-1">
            {rest.map(({ pid, score, rank }) => {
              const player = players?.[pid];
              const isMe = pid === myPlayerId;
              const displayed = displayScores[pid] ?? score;
              return (
                <div
                  key={pid}
                  className={`score-row flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer select-none ${
                    isMe ? "bg-purple-900/30 border border-purple-700/50" : "bg-gray-800/50"
                  }`}
                  onClick={(e) => {
                    const el = e.currentTarget;
                    gsap.fromTo(el,
                      { scale: 1 },
                      { scale: 1.08, duration: 0.12, yoyo: true, repeat: 3, ease: "power1.inOut" }
                    );
                  }}
                >
                  <span className="text-gray-500 text-sm w-6 text-center">{rank}</span>
                  <span className={`flex-1 text-sm ${isMe ? "text-white font-semibold" : "text-gray-300"}`}>
                    {player?.name || pid.slice(0, 6)}
                    {isMe && <span className="text-purple-400 text-xs ml-1">YOU</span>}
                  </span>
                  <span className="text-base font-bold tabular-nums text-white">
                    {displayed}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Compact (intermediate) mode ---
  const rankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-400 text-lg">👑</span>;
    if (rank === 2) return <span className="text-gray-300 text-sm">🥈</span>;
    if (rank === 3) return <span className="text-amber-600 text-sm">🥉</span>;
    return <span className="text-gray-500 text-sm w-6 text-center">{rank}</span>;
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      {ranked.map(({ pid, score, rank }) => {
        const player = players?.[pid];
        const isMe = pid === myPlayerId;
        const displayed = displayScores[pid] ?? score;
        return (
          <div
            key={pid}
            className={`score-row flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer select-none ${
              isMe ? "bg-purple-900/30 border border-purple-700/50" : "bg-gray-800/50"
            }`}
            onClick={(e) => {
              const el = e.currentTarget;
              gsap.fromTo(el,
                { scale: 1 },
                { scale: 1.08, duration: 0.12, yoyo: true, repeat: 3, ease: "power1.inOut" }
              );
            }}
          >
            <div className="w-8 flex justify-center">{rankBadge(rank)}</div>
            <span className={`flex-1 text-sm ${isMe ? "text-white font-semibold" : "text-gray-300"}`}>
              {player?.name || pid.slice(0, 6)}
              {isMe && <span className="text-purple-400 text-xs ml-1">YOU</span>}
            </span>
            <span className={`text-lg font-bold tabular-nums ${
              rank === 1 ? "text-yellow-400" : "text-white"
            }`}>
              {displayed}
            </span>
          </div>
        );
      })}
    </div>
  );
}

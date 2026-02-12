"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";

interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  size?: number;
}

const COLORS = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#10b981",
  "#ec4899", "#3b82f6", "#f97316", "#14b8a6", "#a855f7",
];

export function PieChart({ data, size = 200 }: PieChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hasAnimated = useRef(false);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <p className="text-sm text-gray-500">データがありません</p>;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  // Build path data for each slice
  const slices: { path: string; color: string; label: string; pct: number }[] = [];
  let startAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    const pct = d.value / total;
    const angle = pct * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slices.push({
      path,
      color: d.color || COLORS[i % COLORS.length],
      label: d.label,
      pct: Math.round(pct * 100),
    });
    startAngle = endAngle;
  });

  useEffect(() => {
    if (!svgRef.current || hasAnimated.current) return;
    hasAnimated.current = true;
    const paths = svgRef.current.querySelectorAll(".pie-slice");
    gsap.from(paths, {
      scale: 0,
      opacity: 0,
      transformOrigin: `${cx}px ${cy}px`,
      duration: 0.6,
      stagger: 0.1,
      ease: "back.out(1.7)",
    });
  }, [cx, cy]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} className="pie-slice" d={s.path} fill={s.color} stroke="#1f2937" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-300">{s.label}</span>
            <span className="text-gray-500">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

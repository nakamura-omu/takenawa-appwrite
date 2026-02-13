"use client";

import { useState, useEffect } from "react";

export default function StepTimer({ stepTimestamp, durationMinutes }: { stepTimestamp?: number; durationMinutes?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!stepTimestamp) return;
    const update = () => setElapsed(Math.floor((Date.now() - stepTimestamp) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [stepTimestamp]);

  if (!stepTimestamp) return null;

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const elapsedStr = `${elapsedMin}:${String(elapsedSec).padStart(2, "0")}`;

  if (!durationMinutes) {
    return (
      <span className="ml-2 text-xs text-gray-400 tabular-nums">
        {elapsedStr}
      </span>
    );
  }

  const targetSec = durationMinutes * 60;
  const overTime = elapsed > targetSec;
  const overSec = elapsed - targetSec;
  const overMin = Math.floor(overSec / 60);

  return (
    <span className={`ml-2 text-xs tabular-nums font-medium ${overTime ? "text-red-400" : "text-green-400"}`}>
      {elapsedStr} / {durationMinutes}:00
      {overTime && ` (+${overMin}:${String(overSec % 60).padStart(2, "0")})`}
    </span>
  );
}

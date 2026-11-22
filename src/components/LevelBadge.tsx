"use client";

import { useEffect, useState } from "react";
import {
  loadProgress,
  levelTitle,
  progressToNextLevel,
  type ProgressState,
} from "@/lib/progress";

export function LevelBadge() {
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const onStorage = () => setProgress(loadProgress());
    window.addEventListener("plume-progress", onStorage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("plume-progress", onStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!progress) return null;
  const { ratio, next } = progressToNextLevel(progress);

  return (
    <div
      className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-ink-2/60 px-3 py-1.5 sm:flex"
      title={`${progress.xp} XP · next level at ${next} XP · streak ${progress.streak}d`}
    >
      <span className="brand-display text-sm font-bold text-citrus">
        Nv {progress.level}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-mist">
        {levelTitle(progress.level)}
      </span>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-ink-3">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-citrus transition-all"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      {progress.streak > 0 && (
        <span className="text-[11px] text-ember">{progress.streak}j</span>
      )}
    </div>
  );
}

export function notifyProgressUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("plume-progress"));
  }
}

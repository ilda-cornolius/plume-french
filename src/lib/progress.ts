/** Client-side level / XP / streak for Plume practice. */

export type ProgressState = {
  xp: number;
  level: number;
  streak: number;
  lastPracticeDate: string | null; // YYYY-MM-DD local
  totalCorrections: number;
};

const STORAGE_KEY = "plume_progress_v1";

export function xpForLevel(level: number): number {
  // Cumulative XP required to reach `level` (level 1 starts at 0)
  if (level <= 1) return 0;
  return Math.round(40 * Math.pow(level - 1, 1.65));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return Math.min(level, 99);
}

export function levelTitle(level: number): string {
  if (level >= 20) return "Maître";
  if (level >= 15) return "Écrivain";
  if (level >= 10) return "Fluide";
  if (level >= 6) return "Apprenti";
  if (level >= 3) return "Débutant+";
  return "Novice";
}

export function defaultProgress(): ProgressState {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    lastPracticeDate: null,
    totalCorrections: 0,
  };
}

export function loadProgress(): ProgressState {
  if (typeof window === "undefined") return defaultProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as ProgressState;
    return {
      ...defaultProgress(),
      ...parsed,
      level: levelFromXp(parsed.xp || 0),
    };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(state: ProgressState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Award XP after a successful rewrite/correction. */
export function awardPracticeXp(opts: {
  issueCount: number;
  hadChange: boolean;
}): { state: ProgressState; gained: number; leveledUp: boolean } {
  const prev = loadProgress();
  const today = todayKey();
  let streak = prev.streak;

  if (prev.lastPracticeDate === today) {
    // same day — keep streak
  } else if (prev.lastPracticeDate === yesterdayKey()) {
    streak = Math.max(1, prev.streak) + 1;
  } else {
    streak = 1;
  }

  const base = opts.hadChange ? 18 : 8;
  const issueBonus = Math.min(opts.issueCount, 6) * 4;
  const streakBonus = Math.min(streak, 7) * 2;
  const gained = base + issueBonus + streakBonus;

  const xp = prev.xp + gained;
  const level = levelFromXp(xp);
  const state: ProgressState = {
    xp,
    level,
    streak,
    lastPracticeDate: today,
    totalCorrections: prev.totalCorrections + 1,
  };
  saveProgress(state);
  return { state, gained, leveledUp: level > prev.level };
}

export function progressToNextLevel(state: ProgressState): {
  current: number;
  next: number;
  ratio: number;
} {
  const current = xpForLevel(state.level);
  const next = xpForLevel(state.level + 1);
  const span = Math.max(1, next - current);
  const ratio = Math.min(1, Math.max(0, (state.xp - current) / span));
  return { current, next, ratio };
}

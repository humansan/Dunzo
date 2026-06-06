import {
  format,
  parseISO,
  subDays,
  addDays
} from 'date-fns';
import { DayTodos } from '../types';
import { hasDate } from './todoFilters';

export interface XpStats {
  earned: number;             // XP from completed todos on the given date
  potential: number;          // XP from every todo on the given date (done + not)
  upForGrabs: number;         // XP still available to earn today (potential - earned)
  target: number;             // first goal to beat — strictly yesterday's earned XP
  yesterday: number;          // XP earned the day before the given date (same as target)
  bestLast7Days: number;      // highest single-day earned XP over the 7 days before the date
  avgLast7Days: number;       // average daily earned XP over the 7 days before the date
  bestAllTime: number;        // highest single-day earned XP over every prior day
  totalAllTime: number;       // sum of every day's earned XP, all time (incl. the date)
  percent: number;            // earned / target, clamped to 0..100 for the bar fill
  remaining: number;          // max(0, target - earned)
  reachedTarget: boolean;     // beaten/matched yesterday (gold)
  reachedWeekBest: boolean;   // beaten/matched the best of the last 7 days (violet)
  reachedAllTimeBest: boolean;// beaten/matched the all-time best
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** Sum of XP across completed todos on a given date. */
export function getEarnedXp(dayTodos: DayTodos[], date: string): number {
  const day = dayTodos.find(d => d.date === date);
  if (!day) return 0;
  return (day.todos || []).reduce(
    (sum, t) => sum + (t && t.completed && t.xp ? t.xp : 0),
    0
  );
}

/** Sum of XP across all todos on a given date, regardless of completion. */
export function getPotentialXp(dayTodos: DayTodos[], date: string): number {
  const day = dayTodos.find(d => d.date === date);
  if (!day) return 0;
  return (day.todos || []).reduce((sum, t) => sum + (t && t.xp ? t.xp : 0), 0);
}

/**
 * Compute the day's XP picture for the gamification UI. Goals are tiered and
 * progressive: first beat yesterday's earned XP, then the best single day of
 * the last 7 days, then the all-time best. Each tier is measured against prior
 * days only (the current date is excluded) so the records stay beatable. The
 * total-all-time figure includes the current date, since it's a lifetime sum.
 */
export function computeXpStats(
  dayTodos: DayTodos[],
  date: string,
  _weekStartsOn: number
): XpStats {
  const parsed = parseISO(date);

  // Build O(1) lookup maps once so no inner loop calls getEarnedXp (which was
  // O(n) via dayTodos.find), turning the all-time loop from O(n²) to O(n).
  const earnedByDate = new Map<string, number>();
  const potentialByDate = new Map<string, number>();
  for (const day of dayTodos) {
    let e = 0, p = 0;
    for (const t of day.todos || []) {
      if (t?.xp) p += t.xp;
      if (t?.completed && t?.xp) e += t.xp;
    }
    earnedByDate.set(day.date, e);
    potentialByDate.set(day.date, p);
  }
  const earnedOf = (d: string) => earnedByDate.get(d) ?? 0;

  const earned = earnedOf(date);
  const potential = potentialByDate.get(date) ?? 0;
  const upForGrabs = Math.max(0, potential - earned);

  const yesterday = earnedOf(dayKey(subDays(parsed, 1)));
  const target = yesterday;

  // Best single day, and average daily earned, over the 7 calendar days
  // immediately before `date`.
  let bestLast7Days = 0;
  let sumLast7Days = 0;
  for (let i = 1; i <= 7; i++) {
    const dayEarned = earnedOf(dayKey(subDays(parsed, i)));
    bestLast7Days = Math.max(bestLast7Days, dayEarned);
    sumLast7Days += dayEarned;
  }
  const avgLast7Days = Math.round(sumLast7Days / 7);

  // Best single day, and lifetime total, across every recorded day. Bests
  // exclude the current date so they remain a target; the total includes it.
  let bestAllTime = 0;
  let totalAllTime = 0;
  for (const day of dayTodos) {
    if (!hasDate(day.date)) continue; // skip the undated Task Planner bucket
    const dayEarned = earnedOf(day.date); // O(1) map lookup
    totalAllTime += dayEarned;
    if (day.date !== date) bestAllTime = Math.max(bestAllTime, dayEarned);
  }

  const percent =
    target > 0 ? Math.min(100, (earned / target) * 100) : earned > 0 ? 100 : 0;
  const remaining = Math.max(0, target - earned);

  return {
    earned,
    potential,
    upForGrabs,
    target,
    yesterday,
    bestLast7Days,
    avgLast7Days,
    bestAllTime,
    totalAllTime,
    percent,
    remaining,
    // Must actually earn something — a 0/0 day hasn't "hit" anything.
    reachedTarget: earned > 0 && earned >= target,
    reachedWeekBest: earned > 0 && earned >= bestLast7Days,
    reachedAllTimeBest: earned > 0 && earned >= bestAllTime
  };
}

/**
 * Earned XP for each of the last `weeks` sliding 7-day windows, oldest first
 * (the final entry is the current week). Windows end on today and step back 7
 * days at a time — the same shape as the stats page "Week" chart.
 */
export function getWeeklyXp(dayTodos: DayTodos[], weeks: number): number[] {
  const earnedByDate = new Map<string, number>();
  for (const day of dayTodos) {
    let e = 0;
    for (const t of day.todos || []) {
      if (t?.completed && t?.xp) e += t.xp;
    }
    earnedByDate.set(day.date, e);
  }

  const today = new Date();
  const result: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    let sum = 0;
    const endDay = subDays(today, i * 7);
    for (let offset = 0; offset < 7; offset++) {
      sum += earnedByDate.get(dayKey(subDays(endDay, offset))) ?? 0;
    }
    result.push(sum);
  }
  return result;
}

export interface StarStreakStats {
  stars: number;     // 0..3 earned on `date`
  streak: number;    // consecutive streak as of `date` (live while it's today)
  avg7: number;      // trailing 7-day average earned — the 2★ "hold" floor
  yesterday: number; // previous day's earned — the 3★ "advance" bar
}

/**
 * Stars and the streak counter, derived purely from history (no separate
 * persistence). Stars are tiered so they stay monotonic:
 *   1★  complete at least one task (low-hanging fruit)
 *   2★  earned ≥ your trailing 7-day average (hold your norm)
 *   3★  2★ AND earned ≥ yesterday's earned (improve on the previous day)
 *
 * The streak walks every calendar day from the first record to `date`: 3★ pushes
 * it up, 2★ holds it, anything less resets it to 0 — so a skipped/empty day
 * breaks it. The current day is "live": it can only extend or hold the streak,
 * never reset it mid-day (the reset only lands once today rolls into the past).
 */
export function computeStarStreak(dayTodos: DayTodos[], date: string): StarStreakStats {
  // Precompute per-day earned/completed so the day-walk stays cheap.
  const earnedByDate = new Map<string, number>();
  const completedByDate = new Map<string, number>();
  for (const day of dayTodos) {
    let e = 0;
    let c = 0;
    for (const t of day.todos || []) {
      if (t && t.completed) {
        c++;
        if (t.xp) e += t.xp;
      }
    }
    earnedByDate.set(day.date, e);
    completedByDate.set(day.date, c);
  }
  const earnedOf = (s: string) => earnedByDate.get(s) ?? 0;
  const completedOf = (s: string) => completedByDate.get(s) ?? 0;
  const avg7Of = (parsed: Date) => {
    let sum = 0;
    for (let i = 1; i <= 7; i++) sum += earnedOf(dayKey(subDays(parsed, i)));
    return sum / 7;
  };
  const starsOf = (dStr: string) => {
    const parsed = parseISO(dStr);
    const e = earnedOf(dStr);
    const avg = avg7Of(parsed);
    const prev = earnedOf(dayKey(subDays(parsed, 1)));
    if (e > 0 && e >= avg && e >= prev) return 3;
    if (e > 0 && e >= avg) return 2;
    if (completedOf(dStr) >= 1) return 1;
    return 0;
  };

  const parsedDate = parseISO(date);
  const stars = starsOf(date);
  const avg7 = avg7Of(parsedDate);
  const yesterday = earnedOf(dayKey(subDays(parsedDate, 1)));

  const recorded = dayTodos.map(d => d.date).filter(hasDate).sort();
  let streak = 0;
  if (recorded.length > 0) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const endStr = date < todayStr ? date : todayStr; // never walk into the future
    let cursor = parseISO(recorded[0]);
    const end = parseISO(endStr);
    while (cursor <= end) {
      const dStr = dayKey(cursor);
      const s = starsOf(dStr);
      if (dStr === todayStr) {
        if (s >= 3) streak += 1; // live: extend; below 3★ just holds
      } else if (s >= 3) {
        streak += 1;
      } else if (s < 2) {
        streak = 0;
      } // s === 2 holds
      cursor = addDays(cursor, 1);
    }
  }

  return { stars, streak, avg7, yesterday };
}

import {
  format,
  parseISO,
  subDays,
  addDays
} from 'date-fns';
import { DayTodos, Todo } from '@shared/types';
import { hasDate, showsOnDailyChecklist } from '@/features/tasks/model';
import { isDone } from '@/features/tasks/model';

export interface XpStats {
  earned: number;             // XP from completed todos on the given date
  potential: number;          // XP from every todo on the given date (done + not)
  upForGrabs: number;         // XP still available to earn today (potential - earned)
  target: number;             // first goal to beat - strictly yesterday's earned XP
  yesterday: number;          // XP earned the day before the given date (same as target)
  bestLast7Days: number;      // highest single-day earned XP over the 7 days before the date
  avgLast7Days: number;       // average daily earned XP over the 7 days before the date
  avgLast30Days: number;      // average daily earned XP over the 30 days before the date
  bestAllTime: number;        // highest single-day earned XP over every prior day
  totalAllTime: number;       // sum of every day's earned XP, all time (incl. the date)
  percent: number;            // earned / target, clamped to 0..100 for the bar fill
  remaining: number;          // max(0, target - earned)
  reachedTarget: boolean;     // beaten/matched yesterday (gold)
  reachedWeekBest: boolean;   // beaten/matched the best of the last 7 days (violet)
  reachedAllTimeBest: boolean;// beaten/matched the all-time best
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

// ── The XP ledger ───────────────────────────────────────────────────────────
//
// Only todos on the daily checklist feed the XP system. `dayTodos` buckets every
// todo by dueDate, including Task Planner tasks that never render on the daily
// list (showInDailyList !== true), so anything that reads a day's todos raw would
// award XP and stars for tasks the user cannot see. Every count below therefore
// goes through showsOnDailyChecklist - which also rejects the UNDATED bucket.

/** Per-day rollups of the daily-checklist todos, keyed by 'yyyy-MM-dd'. */
export interface XpHistory {
  earnedByDate: Map<string, number>;
  potentialByDate: Map<string, number>;
  completedCountByDate: Map<string, number>;
  completedTodosByDate: Map<string, Todo[]>;
  totalTasksByDate: Map<string, number>;
  earnedOf: (date: string) => number;
  potentialOf: (date: string) => number;
  completedOf: (date: string) => number;
}

/**
 * Roll every daily-checklist todo up per day, once. Callers that need XP, star
 * or streak numbers should build this and share it - the lookups below are O(1),
 * which is what keeps the all-time and streak walks linear.
 */
export function buildXpHistory(dayTodos: DayTodos[]): XpHistory {
  const earnedByDate = new Map<string, number>();
  const potentialByDate = new Map<string, number>();
  const completedCountByDate = new Map<string, number>();
  const completedTodosByDate = new Map<string, Todo[]>();
  const totalTasksByDate = new Map<string, number>();

  for (const day of dayTodos || []) {
    if (!hasDate(day.date)) continue; // skip the undated Task Planner bucket
    let earned = 0;
    let potential = 0;
    let completedCount = 0;
    let total = 0;
    const completedTodos: Todo[] = [];

    for (const t of day.todos || []) {
      if (!t || !showsOnDailyChecklist(t, day.date)) continue;
      total++;
      potential += t.xp || 0;
      if (isDone(t)) {
        completedCount++;
        completedTodos.push(t);
        earned += t.xp || 0;
      }
    }

    earnedByDate.set(day.date, earned);
    potentialByDate.set(day.date, potential);
    completedCountByDate.set(day.date, completedCount);
    completedTodosByDate.set(day.date, completedTodos);
    totalTasksByDate.set(day.date, total);
  }

  return {
    earnedByDate,
    potentialByDate,
    completedCountByDate,
    completedTodosByDate,
    totalTasksByDate,
    earnedOf: (date) => earnedByDate.get(date) ?? 0,
    potentialOf: (date) => potentialByDate.get(date) ?? 0,
    completedOf: (date) => completedCountByDate.get(date) ?? 0
  };
}

/** Mean earned XP over the `days` calendar days immediately before `parsed`. */
export function avgPriorDays(history: XpHistory, parsed: Date, days: number): number {
  let sum = 0;
  for (let i = 1; i <= days; i++) sum += history.earnedOf(dayKey(subDays(parsed, i)));
  return sum / days;
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
  const history = buildXpHistory(dayTodos);
  const earnedOf = history.earnedOf;

  const earned = earnedOf(date);
  const potential = history.potentialOf(date);
  const upForGrabs = Math.max(0, potential - earned);

  const yesterday = earnedOf(dayKey(subDays(parsed, 1)));
  const target = yesterday;

  // Best single day over the 7 calendar days immediately before `date`.
  let bestLast7Days = 0;
  for (let i = 1; i <= 7; i++) {
    bestLast7Days = Math.max(bestLast7Days, earnedOf(dayKey(subDays(parsed, i))));
  }
  const avgLast7Days = Math.round(avgPriorDays(history, parsed, 7));
  const avgLast30Days = Math.round(avgPriorDays(history, parsed, 30));

  // Best single day, and lifetime total, across every recorded day. Bests
  // exclude the current date so they remain a target; the total includes it.
  let bestAllTime = 0;
  let totalAllTime = 0;
  for (const [dStr, dayEarned] of history.earnedByDate) {
    totalAllTime += dayEarned;
    if (dStr !== date) bestAllTime = Math.max(bestAllTime, dayEarned);
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
    avgLast30Days,
    bestAllTime,
    totalAllTime,
    percent,
    remaining,
    // Must actually earn something - a 0/0 day hasn't "hit" anything.
    reachedTarget: earned > 0 && earned >= target,
    reachedWeekBest: earned > 0 && earned >= bestLast7Days,
    reachedAllTimeBest: earned > 0 && earned >= bestAllTime
  };
}

/**
 * Earned XP for each of the last `weeks` sliding 7-day windows, oldest first
 * (the final entry is the current week). Windows end on today and step back 7
 * days at a time - the same shape as the stats page "Week" chart.
 */
export function getWeeklyXp(dayTodos: DayTodos[], weeks: number): number[] {
  const { earnedOf } = buildXpHistory(dayTodos);
  const today = new Date();
  const result: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    let sum = 0;
    const endDay = subDays(today, i * 7);
    for (let offset = 0; offset < 7; offset++) {
      sum += earnedOf(dayKey(subDays(endDay, offset)));
    }
    result.push(sum);
  }
  return result;
}

// ── Stars ───────────────────────────────────────────────────────────────────

/** The three independent star goals for a single day. */
export interface StarFlags {
  completedTask: boolean;  // completed at least one task
  beatYesterday: boolean;  // earned ≥ yesterday's earned (and earned > 0)
  beatAverage: boolean;    // earned ≥ the higher of the 7- and 30-day averages
}

export interface DayStars {
  flags: StarFlags;
  stars: number;     // 0..3 - how many of the flags are true
  yesterday: number; // previous day's earned XP
  avg7: number;      // trailing 7-day average earned
  avg30: number;     // trailing 30-day average earned
  avgTarget: number; // max(avg7, avg30) - the bar the third star measures against
}

/**
 * The three star goals for `date`. They are independent - meeting them in any
 * order lights the same stars - and each is gated on earning XP *today* rather
 * than on the baseline being non-zero. So a day following an empty stretch still
 * has to earn something to clear "beat yesterday" (0 ≥ 0 is not enough), but a
 * single point is then enough to clear a baseline of zero.
 *
 *   ★ complete at least one task
 *   ★ earn ≥ yesterday's XP
 *   ★ earn ≥ your trailing 7- or 30-day average, whichever is higher
 */
export function starsFor(history: XpHistory, date: string): DayStars {
  const parsed = parseISO(date);
  const earned = history.earnedOf(date);
  const yesterday = history.earnedOf(dayKey(subDays(parsed, 1)));
  // Round to match the averages shown in the UI (computeXpStats + XpProgressBar):
  // earned XP is always an integer, so comparing against the raw fraction would make
  // "match the displayed average" fall short whenever it rounds down (e.g. avg 4.4 shows
  // as 4, but 4 >= 4.4 is false).
  const avg7 = Math.round(avgPriorDays(history, parsed, 7));
  const avg30 = Math.round(avgPriorDays(history, parsed, 30));
  const avgTarget = Math.max(avg7, avg30);

  const flags: StarFlags = {
    completedTask: history.completedOf(date) >= 1,
    beatYesterday: earned > 0 && earned >= yesterday,
    beatAverage: earned > 0 && earned >= avgTarget
  };
  const stars =
    (flags.completedTask ? 1 : 0) +
    (flags.beatYesterday ? 1 : 0) +
    (flags.beatAverage ? 1 : 0);

  return { flags, stars, yesterday, avg7, avg30, avgTarget };
}

/**
 * The streak as of `date`, walking every calendar day from the first record.
 * 3★ pushes it up, 2★ holds it, anything less resets it to 0 - so a skipped or
 * empty day breaks it. The current day is "live": it can only extend or hold the
 * streak, never reset it mid-day (the reset lands once today rolls into the past).
 */
export function computeStreak(
  history: XpHistory,
  dayTodos: DayTodos[],
  date: string
): number {
  const recorded = dayTodos.map(d => d.date).filter(hasDate).sort();
  if (recorded.length === 0) return 0;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const endStr = date < todayStr ? date : todayStr; // never walk into the future
  let cursor = parseISO(recorded[0]);
  const end = parseISO(endStr);
  let streak = 0;

  while (cursor <= end) {
    const dStr = dayKey(cursor);
    const s = starsFor(history, dStr).stars;
    if (dStr === todayStr) {
      if (s >= 3) streak += 1; // live: extend; below 3★ just holds
    } else if (s >= 3) {
      streak += 1;
    } else if (s < 2) {
      streak = 0;
    } // s === 2 holds
    cursor = addDays(cursor, 1);
  }
  return streak;
}

export interface StarStreakStats extends DayStars {
  streak: number; // consecutive streak as of `date` (live while it's today)
}

/** Stars and the streak counter for `date`, derived purely from history. */
export function computeStarStreak(dayTodos: DayTodos[], date: string): StarStreakStats {
  const history = buildXpHistory(dayTodos);
  return { ...starsFor(history, date), streak: computeStreak(history, dayTodos, date) };
}

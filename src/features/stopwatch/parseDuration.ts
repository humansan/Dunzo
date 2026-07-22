// Parses the custom-duration input in timer mode.
//
// Deliberately separate from the app's clock-time parser (which reads "3p",
// "2:45 am", "33%"): this reads a *length*, not a point in time, so "1:30" means
// an hour and a half rather than half past one.
//
// Accepted:  25 · 90m · 1h · 1h30 · 1h 30m · 1:30 · 1:30:00 · 90s
// A bare number is minutes - the unit people actually mean when they type "25".

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

// Guard against a typo like "100000" locking the UI into a 190-year countdown.
const MAX = 24 * HOUR;

export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  let ms: number | null = null;

  // h:mm or h:mm:ss
  const colon = s.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (colon) {
    const [, a, b, c] = colon;
    ms = c === undefined
      ? Number(a) * HOUR + Number(b) * MIN            // 1:30  -> 1h30m
      : Number(a) * HOUR + Number(b) * MIN + Number(c) * SEC;
  }

  // Bare number -> minutes.
  if (ms === null && /^\d+(\.\d+)?$/.test(s)) ms = Number(s) * MIN;

  // Unit form: 1h30m, 90m, 45s, 2h, and "1h30" (trailing bare number = minutes).
  if (ms === null) {
    // Alternatives are longest-first on purpose: with `m` ahead of `minutes`, the
    // regex would match just the "m" of "90 minutes" and reject "inutes" as junk.
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs|hr|h|minutes?|mins|min|m|seconds?|secs|sec|s)/g;
    let total = 0;
    let hit = false;
    for (const m of s.matchAll(re)) {
      hit = true;
      const n = Number(m[1]);
      total += m[2].startsWith('h') ? n * HOUR : m[2].startsWith('m') ? n * MIN : n * SEC;
    }
    if (hit) {
      // Whatever the unit tokens didn't consume must be blank, or a single
      // trailing number ("1h30"), which reads as minutes. Anything else is junk.
      const rest = s.replace(re, ' ').trim();
      if (rest === '') ms = total;
      else if (/^\d+$/.test(rest)) ms = total + Number(rest) * MIN;
    }
  }

  if (ms === null || !Number.isFinite(ms)) return null;
  ms = Math.round(ms);
  if (ms <= 0 || ms > MAX) return null;
  return ms;
}

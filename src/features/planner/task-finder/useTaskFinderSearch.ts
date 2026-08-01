import { useMemo } from 'react';
import { Todo } from '@shared/types';
import { OrganizerEntry, isDone } from '@/features/tasks/model';
import { fuzzyMatch, isWordStart } from '@/common/lib/fuzzyMatch';
import { ColKey } from '@/features/planner/types';
import { getFieldDisplayValue } from '@/features/planner/model/viewUtils';

// The Task Finder's search core - modeled on VSCode's *search pane* (literal, then
// ranked), not its quick-open (pure fuzzy). A task is scored into one of the tiers
// below; every candidate is scored, then the whole set is sorted and capped, so the
// BEST `limit` results survive rather than the first `limit` in organizer order.
//
// Fuzzy subsequence matching is the bottom tier and is deliberately hard to reach:
// it only runs when the literal tiers came up nearly empty, and only accepts a match
// that is tight (§DENSITY_FACTOR) or a clean acronym - otherwise a 4-letter query
// "matches" almost every long title, which is what made the old search feel random.
// Collections are never hits.

// Tiers, best first. The gap between tiers dominates any within-tier quality score,
// so a title substring hit always outranks a notes hit.
const TIER = {
  EXACT: 6,        // title === query
  PREFIX: 5,       // title starts with the query
  WORD_PREFIX: 4,  // a word inside the title starts with the query
  SUBSTRING: 3,    // the query appears mid-word in the title
  ALL_TOKENS: 2,   // every query token appears in the title, in any order
  SECONDARY: 1,    // every token appears somewhere across title + searchable fields
  FUZZY: 0,        // guarded subsequence match on the title
} as const;
const TIER_WEIGHT = 1000;

// The fields a bare query is allowed to match, beyond the title. Deliberately NOT
// every column: created/completed dates exist on every task and the numeric columns
// (xp, %, est. time) are digit soup, so including them made single-token queries like
// "2026" or "3" match the entire corpus.
const SEARCHABLE_FIELDS: ColKey[] = ['notes', 'collection', 'status', 'priority', 'date', 'startDate'];

// A 1-char token would match nearly every haystack, so it can't carry a SECONDARY hit
// on its own (it still counts in the title tiers, where matches are far more specific).
const MIN_TOKEN_LEN = 2;

// Fuzzy guards.
const MIN_FUZZY_QUERY = 3;   // shorter queries fuzzy-match everything
const FUZZY_FLOOR = 10;      // only reach for fuzzy when the literal tiers are this thin
const DENSITY_FACTOR = 2.5;  // matched span ≤ 2.5× the query length…
const MIN_FUZZY_SCORE = 0;   // …and the match must not be gap-dominated

// Within-tier quality: prefer an earlier match, a shorter title, and an open task.
const POSITION_WEIGHT = 60;
const BREVITY_WEIGHT = 40;
const BREVITY_SPAN = 200;    // titles at/over this length get no brevity credit
const DONE_PENALTY = -25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function quality(matchIndex: number, titleLen: number, done: boolean): number {
  const position = matchIndex < 0 ? 0 : POSITION_WEIGHT - clamp(matchIndex, 0, POSITION_WEIGHT);
  const brevity = BREVITY_WEIGHT * (1 - clamp(titleLen, 0, BREVITY_SPAN) / BREVITY_SPAN);
  return position + brevity + (done ? DONE_PENALTY : 0);
}

// Every index where `needle` occurs in `hay` (both already lowercased).
function indicesOf(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}

// The literal tiers, cheapest first - returns null when the title doesn't match at all.
function scoreTitle(title: string, lower: string, q: string, tokens: string[]): { tier: number; index: number } | null {
  if (lower === q) return { tier: TIER.EXACT, index: 0 };
  if (lower.startsWith(q)) return { tier: TIER.PREFIX, index: 0 };

  const hits = indicesOf(lower, q);
  if (hits.length > 0) {
    const wordStart = hits.find((i) => isWordStart(title, i));
    return wordStart !== undefined
      ? { tier: TIER.WORD_PREFIX, index: wordStart }
      : { tier: TIER.SUBSTRING, index: hits[0] };
  }

  // Order-independent: "milk buy" finds "Buy milk", which a whole-query match can't.
  if (tokens.length > 1) {
    let earliest = Infinity;
    for (const tok of tokens) {
      const i = lower.indexOf(tok);
      if (i === -1) return null;
      earliest = Math.min(earliest, i);
    }
    return { tier: TIER.ALL_TOKENS, index: earliest };
  }
  return null;
}

// The ranker itself, pure so it can be exercised without a renderer.
export function rankTaskFinderMatches(
  entries: OrganizerEntry[],
  todoById: Map<string, Todo>,
  query: string,
  limit = 50
): OrganizerEntry[] {
  const q = query.trim();
  if (!q) return [];
  const lowerQ = q.toLowerCase();
  const tokens = lowerQ.split(/\s+/).filter(Boolean);
  // Tokens allowed to carry a secondary-field hit (see MIN_TOKEN_LEN).
  const haystackTokens = tokens.filter((t) => t.length >= MIN_TOKEN_LEN);

  const scored: { entry: OrganizerEntry; score: number }[] = [];
  const misses: OrganizerEntry[] = [];

  for (const e of entries) {
    if (e.todo.isCollection) continue;
    const title = e.todo.text ?? '';
    const lower = title.toLowerCase();
    const done = isDone(e.todo);

    const hit = scoreTitle(title, lower, lowerQ, tokens);
    if (hit) {
      scored.push({ entry: e, score: hit.tier * TIER_WEIGHT + quality(hit.index, title.length, done) });
      continue;
    }

    // Secondary fields - only built for titles that didn't match, and only over the
    // curated field set. Joined with a gap so a token can't straddle two fields.
    if (haystackTokens.length > 0) {
      const haystack = (lower + '  ' + SEARCHABLE_FIELDS
        .map((f) => getFieldDisplayValue(e, f, todoById))
        .join('  ')).toLowerCase();
      if (haystackTokens.every((tok) => haystack.includes(tok))) {
        scored.push({ entry: e, score: TIER.SECONDARY * TIER_WEIGHT + quality(-1, title.length, done) });
        continue;
      }
    }
    misses.push(e);
  }

  // Bottom tier: a guarded fuzzy pass over what the literal tiers rejected, and only
  // when they turned up almost nothing - this is the "wtp → Write The Plan" case.
  if (scored.length < FUZZY_FLOOR && lowerQ.length >= MIN_FUZZY_QUERY) {
    for (const e of misses) {
      const title = e.todo.text ?? '';
      const m = fuzzyMatch(q, title);
      if (!m || m.positions.length === 0) continue;
      const span = m.positions[m.positions.length - 1] - m.positions[0] + 1;
      const acronym = m.positions.every((p) => isWordStart(title, p));
      const tight = span <= DENSITY_FACTOR * lowerQ.length && m.score >= MIN_FUZZY_SCORE;
      if (!acronym && !tight) continue;
      scored.push({
        entry: e,
        score: TIER.FUZZY * TIER_WEIGHT + clamp(m.score, 0, 100) + (isDone(e.todo) ? DONE_PENALTY : 0),
      });
    }
  }

  // Sort is stable, so equal scores keep their organizer order.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

export function useTaskFinderSearch(
  entries: OrganizerEntry[],
  todoById: Map<string, Todo>,
  query: string,
  limit = 50
): OrganizerEntry[] {
  const q = query.trim();
  return useMemo(
    () => rankTaskFinderMatches(entries, todoById, q, limit),
    [entries, todoById, q, limit]
  );
}

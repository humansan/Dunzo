// A "smart" fuzzy subsequence matcher in the spirit of VSCode / Sublime quick-open.
// The query must appear as a subsequence of the target (case-insensitive); the match
// is then scored - rewarding consecutive matches, matches at word/camelCase
// boundaries and the first letter, and penalizing gaps and a late first match.
// Returns the best score (for ranking) and the matched character positions (for
// highlighting), or null when the query is not a subsequence of the target.
//
// It's an O(n·m) dynamic program (n = query length, m = target length): M[i][j] is
// the best score for aligning the first i query chars with query char i landing on
// target index j. Predecessors one column back score a consecutive bonus; earlier
// predecessors fold a per-gap penalty in via a running prefix-max.

export interface FuzzyResult {
  score: number;
  positions: number[];
}

const SEQUENTIAL_BONUS = 30;     // matched char immediately after the previous match
const BOUNDARY_BONUS = 30;       // matched char right after a separator (word start)
const CAMEL_BONUS = 30;          // matched char at a camelCase hump
const FIRST_LETTER_BONUS = 15;   // first matched char is the target's very first char
const LEADING_PENALTY = -5;      // per unmatched char before the first match…
const MAX_LEADING_PENALTY = -40; // …capped, so a late start isn't unboundedly punished
// Per unmatched char between two matches. Steep on purpose: a scattered subsequence
// ("plan" inside "Prepare slides for annual…") must not out-score a tight one just
// because its chars happened to land on word boundaries. Callers that need a hard
// cut-off should also gate on match density (§useTaskFinderSearch) - the penalty has
// to stay linear here, since the DP folds it into a running prefix-max.
const GAP_PENALTY = -8;

// The very first target char is both a word boundary and the first letter.
const START_BONUS = FIRST_LETTER_BONUS + BOUNDARY_BONUS;

const SEPARATORS = new Set([' ', '\t', '_', '-', '/', '\\', '.', ':', ',', '(', ')', '[', ']']);

const isUpper = (ch: string) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();

// Does target index j start a "word" - the very first char, a char after a separator,
// or a camelCase hump? Exported because callers rank word-start hits above mid-word
// ones ("pl" in "Plan trip" beats "pl" in "Simple task") and treat an all-word-start
// subsequence as an acronym match ("wtp" → "Write The Plan").
export function isWordStart(target: string, j: number): boolean {
  if (j === 0) return true;
  const prev = target[j - 1];
  const cur = target[j];
  return SEPARATORS.has(prev) || (!isUpper(prev) && isUpper(cur));
}

// Boundary bonus for a match at target index j (the first matched char folds in the
// first-letter bonus + leading penalty separately).
function boundaryBonus(target: string, j: number): number {
  if (j === 0) return 0;
  const prev = target[j - 1];
  const cur = target[j];
  if (SEPARATORS.has(prev)) return BOUNDARY_BONUS;
  if (!isUpper(prev) && isUpper(cur)) return CAMEL_BONUS;
  return 0;
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const n = query.length;
  const m = target.length;
  if (n === 0) return { score: 0, positions: [] };
  if (n > m) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const NEG = -Infinity;
  const M: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m).fill(NEG));
  const back: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m).fill(-1));

  // Row 1 - the first query char, with the first-letter bonus / leading penalty.
  for (let j = 0; j < m; j++) {
    if (t[j] !== q[0]) continue;
    const first = j === 0 ? START_BONUS : boundaryBonus(target, j);
    const lead = Math.max(LEADING_PENALTY * j, MAX_LEADING_PENALTY);
    M[1][j] = first + lead;
  }

  // Rows 2..n - each char lands strictly after the previous match.
  for (let i = 2; i <= n; i++) {
    // Running prefix-max of (M[i-1][j'] - GAP_PENALTY*j') over j' ≤ j-2 - the
    // linearized non-consecutive predecessor (gap penalty folded in when used).
    let prefBest = NEG;
    let prefIdx = -1;
    for (let j = i - 1; j < m; j++) {
      const jj = j - 2;
      if (jj >= 0 && M[i - 1][jj] > NEG) {
        const v = M[i - 1][jj] - GAP_PENALTY * jj;
        if (v > prefBest) { prefBest = v; prefIdx = jj; }
      }
      if (t[j] !== q[i - 1]) continue;

      let best = NEG;
      let bestFrom = -1;
      // Consecutive predecessor (j-1) → sequential bonus, no gap.
      if (j - 1 >= 0 && M[i - 1][j - 1] > NEG) {
        const s = M[i - 1][j - 1] + SEQUENTIAL_BONUS;
        if (s > best) { best = s; bestFrom = j - 1; }
      }
      // Non-consecutive predecessor (≤ j-2) → prefix-max with the gap penalty.
      if (prefIdx !== -1) {
        const s = prefBest + GAP_PENALTY * (j - 1); // = M[i-1][j'] + GAP*(j-1-j')
        if (s > best) { best = s; bestFrom = prefIdx; }
      }
      if (best === NEG) continue;
      M[i][j] = best + boundaryBonus(target, j);
      back[i][j] = bestFrom;
    }
  }

  // Best full match across the last row.
  let bestJ = -1;
  let bestScore = NEG;
  for (let j = n - 1; j < m; j++) {
    if (M[n][j] > bestScore) { bestScore = M[n][j]; bestJ = j; }
  }
  if (bestJ === -1) return null;

  // Backtrack the matched positions.
  const positions: number[] = [];
  let i = n;
  let j = bestJ;
  while (i >= 1 && j >= 0) {
    positions.push(j);
    j = back[i][j];
    i -= 1;
  }
  positions.reverse();
  return { score: bestScore, positions };
}

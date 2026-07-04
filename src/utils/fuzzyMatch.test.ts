// Unit checks for fuzzyMatch. No test runner is wired up, so this self-asserts and
// is run directly:  npx tsx src/utils/fuzzyMatch.test.ts
import { fuzzyMatch } from './fuzzyMatch';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}
const score = (q: string, t: string) => fuzzyMatch(q, t)?.score ?? -Infinity;

// Subsequence requirement.
check('non-subsequence → null', fuzzyMatch('xyz', 'ab c') === null);
check('empty query → score 0', fuzzyMatch('', 'anything')?.score === 0);
check('query longer than target → null', fuzzyMatch('abcd', 'abc') === null);
check('case-insensitive match', fuzzyMatch('AB', 'about')?.positions.length === 2);

// Ordering — the whole point of scoring.
check('exact prefix beats scattered', score('abc', 'abcdef') > score('abc', 'axbxcx'));
check('consecutive beats gapped', score('plan', 'plan the trip') > score('plan', 'p l a n'));
check('word-boundary beats mid-word', score('bar', 'foo bar') > score('bar', 'foobar'));
check('camelCase hump is a boundary', score('rp', 'reviewPr') > score('rp', 'reaper'));
check('earlier first match beats later', score('a', 'a x x') > score('a', 'x x a'));

// Positions.
const p = fuzzyMatch('wtp', 'Write The Plan');
check('subsequence positions found', !!p && p.positions.length === 3);
check('positions are ascending + on the right chars',
  !!p && p.positions[0] === 0 && 'Write The Plan'[p.positions[1]].toLowerCase() === 't'
      && 'Write The Plan'[p.positions[2]].toLowerCase() === 'p');

// Ranking a candidate set (best first).
const cands = ['prep task', 'pay rent', 'operator', 'zzz'];
const ranked = cands
  .map((c) => ({ c, s: score('pr', c) }))
  .filter((x) => x.s > -Infinity)
  .sort((a, b) => b.s - a.s)
  .map((x) => x.c);
check('"pr" ranks the prefix match first', ranked[0] === 'prep task');
check('"pr" beats a scattered match', score('pr', 'prep task') > score('pr', 'pay rent'));
check('"pr" excludes a non-subsequence', !ranked.includes('zzz'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);

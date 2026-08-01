// Unit checks for the Task Finder ranker. No test runner is wired up (same as
// fuzzyMatch.test.ts), so this self-asserts and is run directly:
//   npx tsx src/features/planner/task-finder/useTaskFinderSearch.test.ts
import { Todo } from '@shared/types';
import { OrganizerEntry } from '@/features/tasks/model';
import { rankTaskFinderMatches } from './useTaskFinderSearch';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

let seq = 0;
const task = (text: string, extra: Partial<Todo> = {}): OrganizerEntry => ({
  todo: {
    id: `t${seq++}`,
    text,
    completed: false,
    createdAt: '2026-03-03T00:00:00.000Z',
    ...extra,
  } as Todo,
});

const titles = (rs: OrganizerEntry[]) => rs.map((r) => r.todo.text);
const run = (entries: OrganizerEntry[], q: string, limit = 50) =>
  titles(rankTaskFinderMatches(entries, new Map(), q, limit));

// ── Leniency: a scattered subsequence is no longer a match ────────────────────
const scatter = [task('Prepare slides for the annual retrospective meeting'), task('Plan the trip')];
check('scattered subsequence is rejected', !run(scatter, 'plan').includes(scatter[0].todo.text));
check('the real match still hits', run(scatter, 'plan').includes('Plan the trip'));

// ── Tier ordering ─────────────────────────────────────────────────────────────
const tiers = [
  task('Unplanned work'),          // mid-word substring
  task('Trip plan'),               // word prefix
  task('plan'),                    // exact
  task('Plan the offsite'),        // prefix
  task('Milk, then buy the plan'), // prefix loses to none of the above
];
check('tiers rank exact → prefix → word-prefix → substring',
  JSON.stringify(run(tiers, 'plan').slice(0, 3)) === JSON.stringify(['plan', 'Plan the offsite', 'Trip plan']));
check('mid-word substring ranks last', run(tiers, 'plan').includes('Unplanned work'));

// ── Ranking survives the cap (the old code kept the first N, not the best N) ───
const noise = Array.from({ length: 60 }, (_, i) => task(`Unplanned chore ${i}`));
const buried = task('Plan the quarter');
check('an exact-ish match beats 60 earlier weak matches',
  run([...noise, buried], 'plan', 10)[0] === 'Plan the quarter');
check('the cap is respected', run([...noise, buried], 'plan', 10).length === 10);

// ── Token order independence ──────────────────────────────────────────────────
check('tokens match in any order', run([task('Buy milk')], 'milk buy').includes('Buy milk'));
check('a missing token still excludes', run([task('Buy milk')], 'milk bread').length === 0);

// ── Secondary fields ──────────────────────────────────────────────────────────
const withNotes = task('Untitled thing', { notes: 'call the dentist about the crown' });
check('notes are searchable', run([withNotes], 'dentist').length === 1);
check('a title hit outranks a notes hit',
  run([withNotes, task('Dentist appointment')], 'dentist')[0] === 'Dentist appointment');
check('createdAt is NOT searchable', run([withNotes], '2026').length === 0);
check('a 1-char token cannot carry a notes hit', run([withNotes], 'z').length === 0);
check('status labels are searchable',
  run([task('Some task', { status: 'completed' })], 'completed').length === 1);

// ── Guarded fuzzy (bottom tier) ───────────────────────────────────────────────
check('acronym still matches', run([task('Write The Plan')], 'wtp').includes('Write The Plan'));
check('short queries never fuzz', run([task('Write The Plan')], 'wp').length === 0);
check('fuzzy yields to literal hits',
  run([task('Write The Plan'), ...Array.from({ length: 12 }, (_, i) => task(`wtp ${i}`))], 'wtp')
    .indexOf('Write The Plan') === -1);
check('a loose subsequence is rejected',
  run([task('Xylophone yesterday zebra')], 'xyz').length === 0);

// ── Misc ──────────────────────────────────────────────────────────────────────
check('collections are never hits',
  run([task('Planning', { isCollection: true })], 'plan').length === 0);
check('empty query returns nothing', run([task('Plan')], '   ').length === 0);
check('completed tasks rank below open ones',
  run([task('Plan A', { status: 'completed' }), task('Plan B')], 'plan')[0] === 'Plan B');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);

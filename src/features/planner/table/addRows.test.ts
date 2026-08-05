// Unit checks for contextual add-row placement. No test runner is wired up (same
// as useTaskFinderSearch.test.ts), so this self-asserts and is run directly:
//   npx tsx src/features/planner/table/addRows.test.ts
import { Todo } from '@shared/types';
import { FlatNode, GroupRow } from '@/features/planner/types';
import { planAddRows, planGroupAddRows, addRowsByAnchor } from './addRows';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) {
    failures++;
    if (detail !== undefined) console.log('      got:', JSON.stringify(detail));
  }
}

// A rendered row. `p` is the parent row id, `d` the depth; indent tracks depth
// closely enough for these cases (the real indent rule is flattenTree's).
const row = (
  id: string,
  d: number,
  p: string | null,
  extra: { coll?: boolean; kids?: boolean; indent?: number } = {}
): FlatNode => ({
  id,
  parentId: p,
  depth: d,
  indent: extra.indent ?? d,
  entry: { todo: { id, text: id, isCollection: extra.coll } as Todo },
  hasChildren: extra.kids ?? false,
  matchesView: true,
});

const find = (specs: ReturnType<typeof planAddRows>, kind: string, id?: string | null) =>
  specs.find((s) => s.kind === kind && (id === undefined || s.id === id));

// ── Collection mode: the root block ──────────────────────────────────────────

{
  // Two root tasks, then a collection - the default 'top' layout.
  const rows = [row('t1', 0, null), row('t2', 0, null), row('c1', 0, null, { coll: true })];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('root add-row follows the last root TASK, above the collection',
    find(specs, 'root')?.after === 't2', find(specs, 'root'));
}

{
  // Same rows under 'bottom': loose tasks sort after the collections, so a new
  // one lands at the very end.
  const rows = [row('c1', 0, null, { coll: true }), row('t1', 0, null), row('t2', 0, null)];
  const specs = planAddRows(rows, { leafPosition: 'bottom' });
  check('under "bottom" the root add-row is last', find(specs, 'root')?.after === 't2');
}

{
  // A root task's subtree must not split the anchor: the add-row goes after the
  // whole subtree, not between the parent and its first child.
  const rows = [row('t1', 0, null, { kids: true }), row('s1', 1, 't1'), row('s2', 1, 't1')];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('root anchor is the END of the last task\'s subtree', find(specs, 'root')?.after === 's2');
}

{
  const rows = [row('c1', 0, null, { coll: true })];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('an empty root block anchors before every row (renders at top)',
    find(specs, 'root')?.after === null);
}

{
  const specs = planAddRows([], { leafPosition: 'top' });
  check('an empty view still offers the root add-row',
    specs.length === 1 && specs[0].kind === 'root' && specs[0].after === null);
}

// ── Collection mode: collections ─────────────────────────────────────────────

{
  // Collection with two tasks and a sub-collection, 'top' layout.
  const rows = [
    row('c1', 0, null, { coll: true, kids: true }),
    row('t1', 1, 'c1'),
    row('t2', 1, 'c1'),
    row('c2', 1, 'c1', { coll: true }),
  ];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a collection\'s add-row follows its last task, above its sub-collections',
    find(specs, 'collection', 'c1')?.after === 't2');
  check('the empty sub-collection gets its own add-row under its header',
    find(specs, 'collection', 'c2')?.after === 'c2');
}

{
  // Sub-collections but no tasks: the add-row sits directly under the header.
  const rows = [
    row('c1', 0, null, { coll: true, kids: true }),
    row('c2', 1, 'c1', { coll: true }),
  ];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a collection with only sub-collections anchors on its own header',
    find(specs, 'collection', 'c1')?.after === 'c1');
}

{
  // Collapsed: hasChildren, but nothing rendered below it.
  const rows = [row('c1', 0, null, { coll: true, kids: true })];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a COLLAPSED collection gets no add-row', find(specs, 'collection') === undefined);
}

{
  const rows = [row('c1', 0, null, { coll: true, kids: false })];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('an EMPTY collection does get one', find(specs, 'collection', 'c1')?.after === 'c1');
}

// ── Collection mode: tasks ───────────────────────────────────────────────────

{
  const rows = [
    row('t1', 0, null, { kids: true }),
    row('s1', 1, 't1', { kids: true }),
    row('s2', 2, 's1'),
  ];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a parent task\'s add-row follows its whole subtree',
    find(specs, 'task', 't1')?.after === 's2');
  check('…and the nested parent gets its own', find(specs, 'task', 's1')?.after === 's2');
  check('add-rows are indented to the children they join',
    find(specs, 'task', 't1')?.indent === 1 && find(specs, 'task', 's1')?.indent === 2);
}

{
  const rows = [row('t1', 0, null)];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a childless task gets no add-row', find(specs, 'task') === undefined);
}

{
  // Collapsed parent: hasChildren true, no rendered children.
  const rows = [row('t1', 0, null, { kids: true })];
  const specs = planAddRows(rows, { leafPosition: 'top' });
  check('a COLLAPSED parent task gets no add-row', find(specs, 'task') === undefined);
}

// ── Ordering when several containers end on the same row ─────────────────────

{
  const rows = [row('t1', 0, null, { kids: true }), row('s1', 1, 't1')];
  const byAnchor = addRowsByAnchor(planAddRows(rows, { leafPosition: 'top' }));
  const at = byAnchor.get('s1') ?? [];
  check('co-anchored add-rows step out deepest-first',
    at.length === 2 && at[0].kind === 'task' && at[1].kind === 'root',
    at.map((s) => s.kind));
}

// ── Attribute-grouped mode ───────────────────────────────────────────────────

const header = (id: string, value: string, isCollapsed = false): GroupRow =>
  ({ type: 'header', id, value, label: value, color: '', count: 0, isCollapsed });
const task = (id: string, depth: number, parentId: string | null, group: string): GroupRow =>
  ({ type: 'task', node: row(id, depth, parentId), group });

{
  const rows: GroupRow[] = [
    header('h:high', 'High'),
    task('t1', 0, null, 'High'),
    task('t2', 0, null, 'High'),
    header('h:low', 'Low'),
    task('t3', 0, null, 'Low'),
  ];
  const specs = planGroupAddRows(rows);
  const groups = specs.filter((s) => s.kind === 'group');
  check('each section gets an add-row at its end',
    groups.length === 2 && groups[0].after === 't2' && groups[1].after === 't3',
    groups.map((s) => s.after));
  check('the section add-row carries the section\'s raw value',
    groups[0].groupValue === 'High' && groups[1].groupValue === 'Low');
  check('grouped mode has no root add-row while it has sections',
    specs.every((s) => s.kind !== 'root'));
}

{
  const rows: GroupRow[] = [
    header('h:high', 'High'),
    task('t1', 0, null, 'High', ),
    task('s1', 1, 't1', 'High'),
    header('h:low', 'Low'),
  ];
  const specs = planGroupAddRows(rows);
  check('a section anchors past a subtree, not inside it',
    specs.find((s) => s.kind === 'group' && s.groupValue === 'High')?.after === 's1');
  check('a parent task inside a section gets its own add-row',
    specs.find((s) => s.kind === 'task' && s.id === 't1')?.after === 's1');
  check('an empty section anchors on its own header',
    specs.find((s) => s.kind === 'group' && s.groupValue === 'Low')?.after === 'h:low');
}

{
  const rows: GroupRow[] = [header('h:high', 'High', true)];
  check('a collapsed section gets no add-row', planGroupAddRows(rows).length === 0);
}

{
  const specs = planGroupAddRows([]);
  check('an empty grouped view falls back to the root add-row',
    specs.length === 1 && specs[0].kind === 'root' && specs[0].after === null);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;

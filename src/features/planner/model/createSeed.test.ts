// Unit checks for the create-seed builder and the owning-group rule it leans on.
// No test runner is wired up (same as useTaskFinderSearch.test.ts), so this
// self-asserts and is run directly:
//   npx tsx src/features/planner/model/createSeed.test.ts
import { format, addDays } from 'date-fns';
import { Todo } from '@shared/types';
import { PLANNER_VIEWS, resolveView } from '@/features/planner/views';
import { FilterRule } from '@/features/planner/types';
import { owningGroupOfTodo } from './viewUtils';
import { buildCreateArgs, anchorGroupValue } from './createSeed';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const today = format(new Date(), 'yyyy-MM-dd');
const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

let seq = 0;
const todo = (extra: Partial<Todo> = {}): Todo =>
  ({ id: `t${seq++}`, text: '', createdAt: Date.now(), showInDatabase: true, ...extra }) as Todo;

const index = (...todos: Todo[]) => new Map(todos.map((t) => [t.id, t]));

const filter = (field: FilterRule['field'], value: string): FilterRule => ({
  id: `f${seq++}`,
  field,
  condition: 'is',
  value,
});

const ALL = resolveView('all');
const DAILY = PLANNER_VIEWS['in-daily-list'];

// ── buildCreateArgs: the precedence chain ────────────────────────────────────

{
  const args = buildCreateArgs({
    parentId: null, groupValue: null, view: ALL, filters: [], groupBy: 'collection',
  });
  check('bare view seeds nothing', Object.keys(args.patch).length === 0 && !args.date);
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: null, view: ALL,
    filters: [filter('priority', 'High')], groupBy: 'collection',
  });
  check('an "is" filter is pre-applied', args.patch.priority === 'high');
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: null, view: DAILY, filters: [], groupBy: 'date',
  });
  // The regression this whole file exists for: the In Daily List tab needs BOTH
  // halves of its seed - the flag and a date - or its own leaf predicate
  // (showInDailyList && dueDate) drops the row the moment it is created.
  check('view seed carries its date, not just its patch',
    args.patch.showInDailyList === true && args.date === today);
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: 'next7', view: DAILY, filters: [], groupBy: 'date',
  });
  // "Next 7 Days" starts 2 days out - today and tomorrow are their own buckets.
  check('a section date beats the view seed date', args.date === day(2));
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: 'Low', view: ALL,
    filters: [filter('priority', 'High')], groupBy: 'priority',
  });
  check('the section beats the filter', args.patch.priority === 'low');
}

{
  const args = buildCreateArgs({
    parentId: 'parent', groupValue: null, view: ALL, filters: [], groupBy: 'priority',
  });
  // A subtask is placed by its root ancestor whatever it carries, so seeding the
  // grouping attribute would write a field the user never asked for to no effect.
  check('groupValue null seeds no attribute even when grouping by one',
    args.patch.priority === undefined && args.parentId === 'parent');
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: 'Low', view: ALL, filters: [], groupBy: 'collection',
  });
  check('collection grouping never seeds an attribute', args.patch.priority === undefined);
}

{
  const args = buildCreateArgs({
    parentId: null, groupValue: '', view: ALL, filters: [], groupBy: 'priority',
  });
  check('the no-value section clears rather than sets', args.patch.priority === undefined);
}

// ── owningGroupOfTodo: which section a row will land in ──────────────────────

{
  const root = todo({ priority: 'high' });
  check('a root task is placed by its own value',
    owningGroupOfTodo(root, 'priority', index(root), today) === 'High');
}

{
  const root = todo({ priority: 'high' });
  const sub = todo({ parentId: root.id, priority: 'low' });
  const deep = todo({ parentId: sub.id });
  const byId = index(root, sub, deep);
  check('a subtask inherits its ROOT\'s section, not its parent\'s value',
    owningGroupOfTodo(sub, 'priority', byId, today) === 'High');
  check('…at any depth', owningGroupOfTodo(deep, 'priority', byId, today) === 'High');
}

{
  const coll = todo({ isCollection: true });
  const task = todo({ parentId: coll.id, priority: 'low' });
  // A collection is not a task parent: a task filed straight under one is a root
  // for grouping, so it is placed by its own value.
  check('a collection parent does not own the section',
    owningGroupOfTodo(task, 'priority', index(coll, task), today) === 'Low');
}

{
  const root = todo({ dueDate: day(5) });
  const sub = todo({ parentId: root.id, dueDate: day(60) });
  check('date grouping inherits the root\'s BUCKET',
    owningGroupOfTodo(sub, 'date', index(root, sub), today) === 'next7');
}

{
  const root = todo({});
  const sub = todo({ parentId: root.id });
  check('an undated root means the no-date section',
    owningGroupOfTodo(sub, 'date', index(root, sub), today) === '');
}

{
  // Corrupt data: a parent cycle must resolve rather than recurse forever.
  const a = todo({ priority: 'high' });
  const b = todo({ parentId: a.id });
  (a as Todo).parentId = b.id;
  check('a parent cycle resolves to ungrouped',
    owningGroupOfTodo(b, 'priority', index(a, b), today) === '');
}

// ── anchorGroupValue: what "add task above/below" seeds ──────────────────────

{
  const anchor = todo({ priority: 'medium' });
  check('a sibling is seeded with the anchor\'s section',
    anchorGroupValue(anchor, 'priority', index(anchor)) === 'Medium');
  check('…and with nothing in collection grouping',
    anchorGroupValue(anchor, 'collection', index(anchor)) === null);
}

{
  const root = todo({ dueDate: day(40) });
  const anchor = todo({ parentId: root.id });
  const seeded = buildCreateArgs({
    parentId: root.id,
    groupValue: anchorGroupValue(anchor, 'date', index(root, anchor)),
    view: ALL, filters: [], groupBy: 'date',
  });
  // next3m starts 31 days out - the earliest day that doesn't fall in next30.
  check('a sibling in a date section lands in that same bucket', seeded.date === day(31));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;

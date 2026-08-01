import { format, parse, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { OrganizerEntry, collectionOf, collectionPath, startPercent, duePercent, percentLabel } from '@/features/tasks/model';
import { Todo, TodoStatus, TodoPriority } from '@shared/types';
import { formatTime12h, formatMinutes } from '@/common/lib/time';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, statusOption, priorityOption } from '@/features/tasks/fields';
import { ColKey, FilterRule, FilterMatch, FlatNode, GroupRow } from '@/features/planner/types';

// Returns a display-formatted string for a field - what the user sees in the
// table cell. This is used for the filter value dropdown and for filter matching.
export function getFieldDisplayValue(
  entry: OrganizerEntry,
  field: ColKey,
  todoById: Map<string, Todo>
): string {
  const { todo } = entry;
  switch (field) {
    case 'title': return todo.text || '';
    case 'status': return todo.status ? (statusOption(todo.status)?.label ?? todo.status) : '';
    case 'priority': return todo.priority ? (priorityOption(todo.priority)?.label ?? todo.priority) : '';
    case 'date': {
      try { return todo.dueDate ? format(parseISO(todo.dueDate), 'MMM d, yyyy') : ''; }
      catch { return todo.dueDate || ''; }
    }
    case 'startDate': {
      try { return todo.startDate ? format(parseISO(todo.startDate), 'MMM d, yyyy') : ''; }
      catch { return todo.startDate || ''; }
    }
    case 'start': return todo.startTime ? formatTime12h(todo.startTime) : '';
    case 'end': return todo.dueTime ? formatTime12h(todo.dueTime) : '';
    case 'percent': return percentLabel(duePercent(todo));
    case 'collection': {
      const coll = collectionOf(todo, todoById);
      return collectionPath(coll, todoById).map((c) => c.text || 'Untitled').join(' / ');
    }
    case 'xp': return todo.xp !== undefined ? String(todo.xp) : '';
    case 'notes': return todo.notes || '';
    case 'startPercent': return percentLabel(startPercent(todo));
    case 'estimatedTime': return todo.estimatedTime !== undefined ? formatMinutes(todo.estimatedTime) : '';
    case 'createdAt': {
      try { return format(new Date(todo.createdAt), 'MMM d, yyyy'); }
      catch { return ''; }
    }
    case 'completedAt': {
      try { return todo.completedAt ? format(new Date(todo.completedAt), 'MMM d, yyyy') : ''; }
      catch { return ''; }
    }
    default: return '';
  }
}

// Returns a sortable raw value: ISO dates for correct lexicographic date sort,
// bare numbers for numeric fields, display strings for everything else.
export function getFieldRawValue(
  entry: OrganizerEntry,
  field: ColKey,
  todoById: Map<string, Todo>
): string {
  const { todo } = entry;
  switch (field) {
    // Rank enum fields by their semantic order (the option index), not their label's
    // spelling - so priority sorts none→low→med→high and status none→todo→active→done.
    // "No value" ⇒ rank 0 (lowest), so an unset field stays at the low end in both
    // directions (last when descending), never alphabetized or flipped to the front.
    case 'priority':
      return String(todo.priority ? PRIORITY_OPTIONS.findIndex((o) => o.value === todo.priority) + 1 : 0);
    case 'status':
      return String(todo.status ? STATUS_OPTIONS.findIndex((o) => o.value === todo.status) + 1 : 0);
    case 'date': return todo.dueDate || '';
    case 'startDate': return todo.startDate || '';
    case 'start': return todo.startTime || '';
    case 'end': return todo.dueTime || '';
    // The percent columns sort on the derived value - monotonic with their time
    // column, which is the point: they're the same value in another unit.
    case 'percent': return String(duePercent(todo) ?? '');
    case 'xp': return todo.xp !== undefined ? String(todo.xp) : '';
    case 'startPercent': return String(startPercent(todo) ?? '');
    case 'estimatedTime': return todo.estimatedTime !== undefined ? String(todo.estimatedTime) : '';
    case 'createdAt': return String(todo.createdAt);
    case 'completedAt': return todo.completedAt !== undefined ? String(todo.completedAt) : '';
    default: return getFieldDisplayValue(entry, field, todoById);
  }
}

// Compare two raw values: numeric when both parse, empty values sort last,
// locale-string otherwise.
export function compareRawValues(a: string, b: string): number {
  if (!a && b) return 1;
  if (a && !b) return -1;
  if (!a && !b) return 0;
  const na = parseFloat(a), nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

// ── Group-by helpers ──────────────────────────────────────────────────────────

// The enum option sets that back the attribute groupings - the single source of
// truth for each value's label and color (defined in todoFields.tsx). Group keys
// are display labels, so header colors are resolved by matching the label.
const FIELD_OPTIONS: Partial<Record<ColKey, typeof STATUS_OPTIONS>> = {
  status: STATUS_OPTIONS,
  priority: PRIORITY_OPTIONS,
};

// Preferred sort order for well-known group values (others fall back to alpha).
const FIELD_GROUP_ORDER: Partial<Record<ColKey, string[]>> = {
  status:   ['Todo', 'In Progress', 'Completed'],
  priority: ['High', 'Medium', 'Low'],
};

// Date grouping uses staggered, relative buckets (first qualifying bucket wins),
// not one section per calendar date. The id is the group key; the label is shown
// on the header. The last bucket is a catch-all for everything further out.
// `startOffset` is the earliest day (as a +/- offset from today, in days) that
// lands in this bucket without spilling into an earlier, more specific one -
// used when quick-adding a task into a date section. Past has no true earliest,
// so it uses yesterday (the most recent past day).
const DATE_BUCKETS: { id: string; label: string; color: string; startOffset: number }[] = [
  { id: 'past',     label: 'Past',          color: 'var(--color-date-past)',     startOffset: -1 },
  { id: 'today',    label: 'Today',         color: 'var(--color-date-today)',    startOffset: 0 },
  { id: 'tomorrow', label: 'Tomorrow',      color: 'var(--color-date-tomorrow)', startOffset: 1 },
  { id: 'next7',    label: 'Next 7 Days',   color: 'var(--color-date-next7)',    startOffset: 2 },
  { id: 'next30',   label: 'Next 30 Days',  color: 'var(--color-date-next30)',   startOffset: 8 },
  { id: 'next3m',   label: 'Next 3 Months', color: 'var(--color-date-next3m)',   startOffset: 31 },
  { id: 'nextyear', label: 'Next Year',     color: 'var(--color-date-nextyear)', startOffset: 91 },
];
const DATE_BUCKET_BY_ID = new Map(DATE_BUCKETS.map((b) => [b.id, b]));

// Map a YYYY-MM-DD date to its relative bucket id, given today's date.
function dateBucketId(dateStr: string, todayStr: string): string {
  let diff: number;
  try { diff = differenceInCalendarDays(parseISO(dateStr), parseISO(todayStr)); }
  catch { return ''; }
  if (diff < 0) return 'past';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'next7';
  if (diff <= 30) return 'next30';
  if (diff <= 90) return 'next3m';
  return 'nextyear';
}

// The raw, assignable group key for a task under a given grouping field. Empty
// string means "no value" (the task floats ungrouped). For date this is a bucket
// id; for everything else it's the cell's display value.
export function getGroupKey(
  entry: OrganizerEntry,
  field: ColKey,
  todoById: Map<string, Todo>,
  todayStr: string
): string {
  if (field === 'date') return entry.todo.dueDate ? dateBucketId(entry.todo.dueDate, todayStr) : '';
  return getFieldDisplayValue(entry, field, todoById);
}

// Header text for the catch-all section: the empty key, holding tasks with no
// value for the grouping field. Named per field so the header says what is
// actually missing rather than describing the grouping. Not derived from the
// column label - that would read "No End Date" for the date grouping. The generic
// fallback covers a field becoming groupable without a phrase here.
const UNGROUPED_LABEL: Partial<Record<ColKey, string>> = {
  status: 'No status',
  priority: 'No priority',
  date: 'No date',
};

// Human-readable header text for a group key.
function getGroupLabel(field: ColKey, key: string): string {
  if (!key) return UNGROUPED_LABEL[field] ?? 'Ungrouped';
  if (field === 'date') return DATE_BUCKET_BY_ID.get(key)?.label ?? key;
  return key;
}

// The canonical (ascending) ordering of group keys for a field.
function groupKeyOrder(field: ColKey): string[] {
  if (field === 'date') return DATE_BUCKETS.map((b) => b.id);
  return FIELD_GROUP_ORDER[field] ?? [];
}

export function getGroupColor(field: ColKey, key: string): string {
  if (field === 'date') return DATE_BUCKET_BY_ID.get(key)?.color ?? 'var(--color-fg-muted)';
  return FIELD_OPTIONS[field]?.find((o) => o.label === key)?.color ?? 'var(--color-fg-muted)';
}

// The Todo patch that moves a task into the group `value` for `field` - used when
// a task is dragged across sections. Returns null for fields that can't be set by
// dropping (collection has its own tree DnD; date buckets are derived ranges).
// An empty value clears the field.
export function groupAssignmentPatch(field: ColKey, value: string): Partial<Todo> | null {
  if (field === 'priority') {
    const opt = PRIORITY_OPTIONS.find((o) => o.label === value);
    return { priority: (opt?.value as TodoPriority) || undefined };
  }
  if (field === 'status') {
    const opt = STATUS_OPTIONS.find((o) => o.label === value);
    const status = (opt?.value as TodoStatus) || undefined;
    // Completion is derived from status; the save path stamps completedAt.
    return { status };
  }
  return null;
}

// What a freshly created task needs to land in the section `value` under `field`
// when the user clicks the "+" on a group header. Returns a calendar date (for
// date buckets) and/or a field patch (priority/status). Date buckets resolve to
// the earliest day that falls in the bucket without spilling into an earlier,
// more specific one - e.g. "Next 7 Days" ⇒ 2 days out, since today and tomorrow
// are their own buckets. 'collection' grouping has its own per-header add path.
export function groupCreateSpec(
  field: ColKey,
  value: string
): { date: string | null; patch: Partial<Todo> } {
  if (field === 'date') {
    const bucket = DATE_BUCKET_BY_ID.get(value);
    if (!bucket) return { date: null, patch: {} };
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return { date: format(addDays(parseISO(todayStr), bucket.startOffset), 'yyyy-MM-dd'), patch: {} };
  }
  return { date: null, patch: groupAssignmentPatch(field, value) ?? {} };
}

// Parse a display-formatted date ("MMM d, yyyy", what getFieldDisplayValue emits)
// back into the canonical yyyy-MM-dd storage form. Returns null if it doesn't parse.
function parseDisplayDate(value: string): string | null {
  try {
    const d = parse(value, 'MMM d, yyyy', new Date());
    return isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

// Build the Todo patch that pre-seeds a newly created task with the values of the
// active filters, so a task created inside a filtered view still satisfies those
// filters (and stays visible) right after creation. Only equality ("is") filters on
// settable fields seed a value - "is not"/"contains"/range conditions and unset
// values can't be turned into a single concrete value and are skipped. Collection
// membership is handled separately (via the task's parent), not here.
export function buildFilterCreatePatch(filters: FilterRule[]): Partial<Todo> {
  const patch: Partial<Todo> = {};
  for (const rule of filters) {
    if (rule.condition !== 'is' || !rule.value) continue;
    switch (rule.field) {
      case 'priority':
      case 'status': {
        const p = groupAssignmentPatch(rule.field, rule.value);
        if (p) Object.assign(patch, p);
        break;
      }
      case 'date': {
        const iso = parseDisplayDate(rule.value);
        if (iso) patch.dueDate = iso;
        break;
      }
      case 'startDate': {
        const iso = parseDisplayDate(rule.value);
        if (iso) patch.startDate = iso;
        break;
      }
      default:
        break;
    }
  }
  return patch;
}

// Build the flat list of rows for the grouped rendering mode.
// Parent/child task relationships are preserved within each group section: a task
// subtree always stays together, nested under its root task, which is placed by
// its own field value (see getOwningGroup). A subtask's own field value never
// pulls it into a different section. Root tasks with no value float ungrouped.
export function buildGroupedItems(
  entries: OrganizerEntry[],
  groupField: ColKey,
  todoById: Map<string, Todo>,
  collapsed: Set<string>,
  sortFn?: (a: OrganizerEntry, b: OrganizerEntry) => number,
  showLeafTasks: 'top' | 'bottom' | 'none' = 'bottom',
  direction: 'asc' | 'desc' = 'asc',
  // Ids satisfying the view's predicate; everything else is a context ancestor
  // (see FlatNode.matchesView). Omit to mark every row as matching.
  matchIds?: Set<string>
): GroupRow[] {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tasks = entries.filter((e) => !e.todo.isCollection);
  const taskById = new Map<string, OrganizerEntry>(tasks.map((e) => [e.todo.id, e]));

  // Returns the direct task parent id (null when parent is a collection or absent).
  const getParentTaskId = (e: OrganizerEntry): string | null => {
    const pid = e.todo.parentId ?? null;
    return pid && taskById.has(pid) ? pid : null;
  };

  // Returns the group section a task belongs to. A subtask ALWAYS belongs to its
  // parent task's section (so a whole task subtree stays together under its root,
  // regardless of any field value the subtask carries). Only a root task - one
  // with no task parent - is placed by its own field value; '' means ungrouped.
  const owningGroupCache = new Map<string, string>();
  const getOwningGroup = (taskId: string): string => {
    const cached = owningGroupCache.get(taskId);
    if (cached !== undefined) return cached;
    const entry = taskById.get(taskId);
    if (!entry) return '';
    const parentId = getParentTaskId(entry);
    // Seed before recursing so a corrupt parent cycle resolves to '' instead of
    // looping. Tasks form a tree (single parent), so there are no false sharings.
    owningGroupCache.set(taskId, '');
    const result = parentId
      ? getOwningGroup(parentId)
      : getGroupKey(entry, groupField, todoById, todayStr);
    owningGroupCache.set(taskId, result);
    return result;
  };

  // Precompute children per task parent. A subtask always follows its parent's
  // section (getOwningGroup), so every task with a task parent nests under it.
  const childrenInGroup = new Map<string, OrganizerEntry[]>();
  for (const task of tasks) {
    const parentId = getParentTaskId(task);
    if (!parentId) continue;
    const arr = childrenInGroup.get(parentId) ?? [];
    arr.push(task);
    childrenInGroup.set(parentId, arr);
  }

  const doSort = (list: OrganizerEntry[]): OrganizerEntry[] => {
    const out = [...list];
    if (sortFn) out.sort(sortFn);
    else out.sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt));
    return out;
  };

  // Recursively emit a task and its in-group children (respecting collapse).
  // `group` is the owning section's key, tagged onto every row for drag handling.
  // `parentId` is the in-section task parent (null for a section root), carried on
  // the node so the table's tree drag-and-drop can reorder/nest like collection mode.
  const buildTaskRows = (taskId: string, depth: number, group: string, parentId: string | null): GroupRow[] => {
    const entry = taskById.get(taskId);
    if (!entry) return [];
    const children = doSort(childrenInGroup.get(taskId) ?? []);
    const hasChildren = children.length > 0;
    // No collections in grouped mode - every parent is a task, so indent == depth.
    const node: FlatNode = {
      id: taskId,
      parentId,
      depth,
      indent: depth,
      entry,
      hasChildren,
      matchesView: !matchIds || matchIds.has(taskId),
    };
    const rows: GroupRow[] = [{ type: 'task', node, group }];
    if (hasChildren && !collapsed.has(taskId)) {
      for (const child of children) rows.push(...buildTaskRows(child.todo.id, depth + 1, group, taskId));
    }
    return rows;
  };

  // Collect root tasks per group (tasks with no task parent sharing the same group).
  const ungrouped: OrganizerEntry[] = [];
  const groups = new Map<string, OrganizerEntry[]>();
  for (const task of tasks) {
    const parentId = getParentTaskId(task);
    const myGroup = getOwningGroup(task.todo.id);
    // Skip if this task nests under a task parent in the same group.
    if (parentId && getOwningGroup(parentId) === myGroup) continue;
    if (!myGroup) { ungrouped.push(task); continue; }
    const arr = groups.get(myGroup) ?? [];
    arr.push(task);
    groups.set(myGroup, arr);
  }

  // Sort group keys: canonical order first, then alpha. `direction` flips the
  // whole sequence (asc = canonical, desc = reversed).
  const order = groupKeyOrder(groupField);
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  if (direction === 'desc') sortedKeys.reverse();

  const groupRows: GroupRow[] = [];
  for (const key of sortedKeys) {
    const rootTasks = doSort(groups.get(key)!);
    const totalCount = tasks.filter((t) => getOwningGroup(t.todo.id) === key).length;
    const headerId = `__grp:${groupField}:${key}`;
    const isCollapsed = collapsed.has(headerId);
    groupRows.push({ type: 'header', id: headerId, value: key, label: getGroupLabel(groupField, key), color: getGroupColor(groupField, key), count: totalCount, isCollapsed });
    if (!isCollapsed) {
      // Depth 0, NOT 1: a section header doesn't cost its tasks an indent level,
      // exactly as a collection header doesn't (see flattenTree's indent rule). This
      // used to start at 1, which pushed every task in a Status/Priority/Date group
      // a full INDENT to the right of its header while the same task under a
      // collection sat flush with it - the two groupings disagreeing about the same
      // relationship. Ungrouped roots below already used 0, so they were also
      // inconsistent with grouped roots at the same structural level.
      for (const root of rootTasks) groupRows.push(...buildTaskRows(root.todo.id, 0, key, null));
    }
  }

  // Tasks with no value for the grouping field get a section of their own, built
  // exactly like the keyed ones above so it collapses, counts and accepts drops
  // through the same machinery - the empty key is already a real group everywhere
  // else (rows are tagged `group: ''`, and dropping on this header runs
  // groupAssignmentPatch with '', which clears the field). Without a header they
  // were the one block of rows that couldn't be collapsed.
  //
  // Only when there are any: an empty section header would be noise, unlike the
  // keyed sections which exist because something is in them.
  const ungroupedRows: GroupRow[] = [];
  if (ungrouped.length > 0) {
    const headerId = `__grp:${groupField}:`;
    const isCollapsed = collapsed.has(headerId);
    ungroupedRows.push({
      type: 'header',
      id: headerId,
      value: '',
      label: getGroupLabel(groupField, ''),
      color: getGroupColor(groupField, ''),
      // Every task in the section, subtasks included - `ungrouped` holds only the
      // roots, so counting it would undercount exactly like the keyed sections
      // would if they counted `rootTasks`.
      count: tasks.filter((t) => getOwningGroup(t.todo.id) === '').length,
      isCollapsed,
    });
    if (!isCollapsed) {
      // Hierarchy is preserved among them, same as inside a keyed section.
      for (const task of doSort(ungrouped)) ungroupedRows.push(...buildTaskRows(task.todo.id, 0, '', null));
    }
  }

  return showLeafTasks === 'top'
    ? [...ungroupedRows, ...groupRows]
    : [...groupRows, ...ungroupedRows];
}

// Apply a view's filter rules to its entries.
//
// A task is kept only when it matches AND every task ancestor of it in this set
// matches too - so a row that fails takes its whole subtree with it. That mirrors
// how grouping treats a subtree as one unit (getOwningGroup above: the parent's
// value decides for everything under it), and it is what keeps the tree intact:
// under the old row-by-row filter a surviving child of a filtered-out parent lost
// its parent from the set, and flattenTree - which links a node only to a parent
// that is present - re-parented it to the root of the view. Nothing can be
// orphaned that way now, because a survivor's ancestors are survivors by
// definition.
//
// Collections are exempt: they are structural, never filtered, and so never break
// a chain. Unset (empty-value) rules are dropped first - matchesFilter treats them
// as "match all", a harmless no-op under AND but one that would make OR pass
// everything.
//
// Pure, and shared by the rendered rows and the sidebar counts, so the two can't
// disagree about what a view contains.
export function applyFilters(
  entries: OrganizerEntry[],
  filters: FilterRule[],
  filterMatch: FilterMatch,
  todoById: Map<string, Todo>
): OrganizerEntry[] {
  const rules = filters.filter((f) => f.value);
  if (!rules.length) return entries;

  const byId = new Map(entries.map((e) => [e.todo.id, e]));
  const selfMatches = (e: OrganizerEntry) =>
    filterMatch === 'or'
      ? rules.some((f) => matchesFilter(e, f, todoById))
      : rules.every((f) => matchesFilter(e, f, todoById));

  // Kept = self matches && nearest task ancestor present in this set is kept.
  // Memoized per id. A parentId cycle (corrupt data) is broken by treating the
  // re-entered node as non-blocking rather than as a failure: the row then stands
  // on its own match, which degrades to the old row-by-row behaviour. Resolving a
  // cycle to "hidden" instead would make those rows disappear from the Planner
  // entirely, with nothing on screen to explain why.
  const verdict = new Map<string, boolean>();
  const visiting = new Set<string>();
  const isKept = (e: OrganizerEntry): boolean => {
    const cached = verdict.get(e.todo.id);
    if (cached !== undefined) return cached;
    if (visiting.has(e.todo.id)) return true;
    visiting.add(e.todo.id);
    let kept = selfMatches(e);
    if (kept) {
      // Walk to the nearest ancestor that is a TASK in this set; collections are
      // exempt and pass through. An ancestor outside the set ends the chain.
      let pid = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (pid && !seen.has(pid)) {
        seen.add(pid);
        const parent = byId.get(pid);
        if (!parent) break;
        if (!parent.todo.isCollection) { kept = isKept(parent); break; }
        pid = parent.todo.parentId ?? null;
      }
    }
    visiting.delete(e.todo.id);
    verdict.set(e.todo.id, kept);
    return kept;
  };

  return entries.filter((e) => e.todo.isCollection || isKept(e));
}

// Returns true if the entry's field value satisfies the filter rule.
// An empty filter value passes every entry (the rule is considered unset).
export function matchesFilter(
  entry: OrganizerEntry,
  rule: FilterRule,
  todoById: Map<string, Todo>
): boolean {
  if (!rule.value) return true;
  const val = getFieldDisplayValue(entry, rule.field, todoById).toLowerCase();
  const filterVal = rule.value.toLowerCase();
  switch (rule.condition) {
    case 'is': return val === filterVal;
    case 'is_not': return val !== filterVal;
    case 'contains': return val.includes(filterVal);
    case 'greater_than': {
      const nv = parseFloat(val), nf = parseFloat(filterVal);
      return !isNaN(nv) && !isNaN(nf) ? nv > nf : val > filterVal;
    }
    case 'less_than': {
      const nv = parseFloat(val), nf = parseFloat(filterVal);
      return !isNaN(nv) && !isNaN(nf) ? nv < nf : val < filterVal;
    }
    default: return true;
  }
}

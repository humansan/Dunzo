import { format, parse, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { OrganizerEntry, collectionOf, collectionPath } from '../../utils/todoFilters';
import { Todo, TodoStatus, TodoPriority } from '../../types';
import { formatTime12h, formatMinutes } from '../../utils/timeUtils';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, statusOption, priorityOption } from '../todoFields';
import { ColKey, FilterRule, FlatNode, GroupRow } from './types';

// Returns a display-formatted string for a field — what the user sees in the
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
    case 'percent': return todo.duePercentage !== undefined ? `${todo.duePercentage}%` : '';
    case 'collection': {
      const coll = collectionOf(todo, todoById);
      return collectionPath(coll, todoById).map((c) => c.text || 'Untitled').join(' / ');
    }
    case 'xp': return todo.xp !== undefined ? String(todo.xp) : '';
    case 'notes': return todo.notes || '';
    case 'startPercent': return todo.startPercentage !== undefined ? `${todo.startPercentage}%` : '';
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
    case 'date': return todo.dueDate || '';
    case 'startDate': return todo.startDate || '';
    case 'start': return todo.startTime || '';
    case 'end': return todo.dueTime || '';
    case 'percent': return todo.duePercentage !== undefined ? String(todo.duePercentage) : '';
    case 'xp': return todo.xp !== undefined ? String(todo.xp) : '';
    case 'startPercent': return todo.startPercentage !== undefined ? String(todo.startPercentage) : '';
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

// The enum option sets that back the attribute groupings — the single source of
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
// lands in this bucket without spilling into an earlier, more specific one —
// used when quick-adding a task into a date section. Past has no true earliest,
// so it uses yesterday (the most recent past day).
const DATE_BUCKETS: { id: string; label: string; color: string; startOffset: number }[] = [
  { id: 'past',     label: 'Past',          color: '#ef4444', startOffset: -1 },
  { id: 'today',    label: 'Today',         color: '#22c55e', startOffset: 0 },
  { id: 'tomorrow', label: 'Tomorrow',      color: '#3b82f6', startOffset: 1 },
  { id: 'next7',    label: 'Next 7 Days',   color: '#8b5cf6', startOffset: 2 },
  { id: 'next30',   label: 'Next 30 Days',  color: '#0ea5e9', startOffset: 8 },
  { id: 'next3m',   label: 'Next 3 Months', color: '#f59e0b', startOffset: 31 },
  { id: 'nextyear', label: 'Next Year',     color: '#64748b', startOffset: 91 },
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

// Human-readable header text for a group key.
function getGroupLabel(field: ColKey, key: string): string {
  if (field === 'date') return DATE_BUCKET_BY_ID.get(key)?.label ?? key;
  return key;
}

// The canonical (ascending) ordering of group keys for a field.
function groupKeyOrder(field: ColKey): string[] {
  if (field === 'date') return DATE_BUCKETS.map((b) => b.id);
  return FIELD_GROUP_ORDER[field] ?? [];
}

export function getGroupColor(field: ColKey, key: string): string {
  if (field === 'date') return DATE_BUCKET_BY_ID.get(key)?.color ?? '#9ca3af';
  return FIELD_OPTIONS[field]?.find((o) => o.label === key)?.color ?? '#9ca3af';
}

// The Todo patch that moves a task into the group `value` for `field` — used when
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
// more specific one — e.g. "Next 7 Days" ⇒ 2 days out, since today and tomorrow
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
// settable fields seed a value — "is not"/"contains"/range conditions and unset
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
  direction: 'asc' | 'desc' = 'asc'
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
  // regardless of any field value the subtask carries). Only a root task — one
  // with no task parent — is placed by its own field value; '' means ungrouped.
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
    const node: FlatNode = { id: taskId, parentId, depth, entry, hasChildren };
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
      for (const root of rootTasks) groupRows.push(...buildTaskRows(root.todo.id, 1, key, null));
    }
  }

  // Ungrouped tasks also preserve hierarchy among themselves.
  const ungroupedRows: GroupRow[] = [];
  for (const task of doSort(ungrouped)) ungroupedRows.push(...buildTaskRows(task.todo.id, 0, '', null));

  return showLeafTasks === 'top'
    ? [...ungroupedRows, ...groupRows]
    : [...groupRows, ...ungroupedRows];
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

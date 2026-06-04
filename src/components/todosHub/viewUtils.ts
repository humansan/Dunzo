import { format, parseISO } from 'date-fns';
import { OrganizerEntry, collectionOf, collectionPath } from '../../utils/todoFilters';
import { Todo } from '../../types';
import { formatTime12h } from '../../utils/timeUtils';
import { ColKey, FilterRule, FlatNode, GroupRow } from './types';

// Returns a display-formatted string for a field — what the user sees in the
// table cell. This is used for the filter value dropdown and for filter matching.
export function getFieldDisplayValue(
  entry: OrganizerEntry,
  field: ColKey,
  todoById: Map<string, Todo>
): string {
  const { todo, date } = entry;
  switch (field) {
    case 'title': return todo.text || '';
    case 'status': {
      const STATUS_LABELS: Record<string, string> = { todo: 'Todo', in_progress: 'In Progress', completed: 'Completed' };
      return todo.status ? (STATUS_LABELS[todo.status] ?? todo.status) : '';
    }
    case 'priority': {
      const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
      return todo.priority ? (PRIORITY_LABELS[todo.priority] ?? todo.priority) : '';
    }
    case 'date': {
      try { return date ? format(parseISO(date), 'MMM d, yyyy') : ''; }
      catch { return date || ''; }
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
  const { todo, date } = entry;
  switch (field) {
    case 'date': return date || '';
    case 'start': return todo.startTime || '';
    case 'end': return todo.dueTime || '';
    case 'percent': return todo.duePercentage !== undefined ? String(todo.duePercentage) : '';
    case 'xp': return todo.xp !== undefined ? String(todo.xp) : '';
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

// Colors for group headers when grouping by status or priority.
// Kept in sync with STATUS_OPTIONS / PRIORITY_OPTIONS in todoFields.tsx.
const FIELD_GROUP_COLORS: Partial<Record<ColKey, Record<string, string>>> = {
  status: {
    'Todo':        '#6b7280',
    'In Progress': '#3b82f6',
    'Completed':   '#22c55e',
  },
  priority: {
    'Low':    '#64748b',
    'Medium': '#f59e0b',
    'High':   '#ef4444',
  },
};

// Preferred sort order for well-known group values (others fall back to alpha).
const FIELD_GROUP_ORDER: Partial<Record<ColKey, string[]>> = {
  status:   ['Todo', 'In Progress', 'Completed'],
  priority: ['High', 'Medium', 'Low'],
};

export function getGroupColor(field: ColKey, label: string): string {
  return FIELD_GROUP_COLORS[field]?.[label] ?? '#9ca3af';
}

// Build the flat list of rows for the grouped rendering mode.
// Parent/child task relationships are preserved within each group section:
// a child appears nested under its parent if the child's group value matches
// the parent's (or if the child has no value and inherits the parent's group).
// A child with a distinct non-empty value breaks out into its own section.
// Tasks with no value and no task ancestor with a value float ungrouped.
export function buildGroupedItems(
  entries: OrganizerEntry[],
  groupField: ColKey,
  todoById: Map<string, Todo>,
  collapsed: Set<string>,
  sortFn?: (a: OrganizerEntry, b: OrganizerEntry) => number,
  showLeafTasks: 'top' | 'bottom' | 'none' = 'bottom'
): GroupRow[] {
  const tasks = entries.filter((e) => !e.todo.isCollection);
  const taskById = new Map<string, OrganizerEntry>(tasks.map((e) => [e.todo.id, e]));

  // Returns the direct task parent id (null when parent is a collection or absent).
  const getParentTaskId = (e: OrganizerEntry): string | null => {
    const pid = e.todo.parentId ?? null;
    return pid && taskById.has(pid) ? pid : null;
  };

  // Returns the group section a task belongs to:
  // - own non-empty field value, or
  // - nearest task ancestor's field value (inherited), or
  // - '' for ungrouped.
  const owningGroupCache = new Map<string, string>();
  const getOwningGroup = (taskId: string): string => {
    if (owningGroupCache.has(taskId)) return owningGroupCache.get(taskId)!;
    const seen = new Set<string>();
    let cur: string | null = taskId;
    const chain: string[] = [];
    while (cur && !seen.has(cur)) {
      if (owningGroupCache.has(cur)) {
        const result = owningGroupCache.get(cur)!;
        for (const id of chain) owningGroupCache.set(id, result);
        return result;
      }
      seen.add(cur);
      const entry = taskById.get(cur);
      if (!entry) break;
      const val = getFieldDisplayValue(entry, groupField, todoById);
      if (val) {
        for (const id of chain) owningGroupCache.set(id, val);
        owningGroupCache.set(cur, val);
        return val;
      }
      chain.push(cur);
      cur = getParentTaskId(entry);
    }
    for (const id of chain) owningGroupCache.set(id, '');
    return '';
  };

  // Precompute in-group children: a child stays under its task parent only when
  // both share the same owning group.
  const childrenInGroup = new Map<string, OrganizerEntry[]>();
  for (const task of tasks) {
    const parentId = getParentTaskId(task);
    if (!parentId) continue;
    if (getOwningGroup(task.todo.id) !== getOwningGroup(parentId)) continue;
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
  const buildTaskRows = (taskId: string, depth: number): GroupRow[] => {
    const entry = taskById.get(taskId);
    if (!entry) return [];
    const children = doSort(childrenInGroup.get(taskId) ?? []);
    const hasChildren = children.length > 0;
    const node: FlatNode = { id: taskId, parentId: null, depth, entry, hasChildren };
    const rows: GroupRow[] = [{ type: 'task', node }];
    if (hasChildren && !collapsed.has(taskId)) {
      for (const child of children) rows.push(...buildTaskRows(child.todo.id, depth + 1));
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

  // Sort group keys: canonical order first, then alpha.
  const order = FIELD_GROUP_ORDER[groupField] ?? [];
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const groupRows: GroupRow[] = [];
  for (const key of sortedKeys) {
    const rootTasks = doSort(groups.get(key)!);
    const totalCount = tasks.filter((t) => getOwningGroup(t.todo.id) === key).length;
    const headerId = `__grp:${groupField}:${key}`;
    const isCollapsed = collapsed.has(headerId);
    groupRows.push({ type: 'header', id: headerId, label: key, color: getGroupColor(groupField, key), count: totalCount, isCollapsed });
    if (!isCollapsed) {
      for (const root of rootTasks) groupRows.push(...buildTaskRows(root.todo.id, 1));
    }
  }

  // Ungrouped tasks also preserve hierarchy among themselves.
  const ungroupedRows: GroupRow[] = [];
  for (const task of doSort(ungrouped)) ungroupedRows.push(...buildTaskRows(task.todo.id, 0));

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

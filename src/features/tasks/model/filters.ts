import { Todo, DayTodos } from '@shared/types';
import {
  hasDate,
  showsInOrganizer,
  showsOnDailyChecklist,
} from '@shared/domain/todoVisibility';

// The visibility rules are enforced on both sides of the wire, so they live in
// `shared/` (see shared/domain/todoVisibility.ts). Re-exported here because this
// module is the client's entry point to the todo domain.
export {
  UNDATED,
  hasDate,
  showsOnDailyChecklist,
  showsInOrganizer,
  normalizeVisibility,
} from '@shared/domain/todoVisibility';

// A todo id together with every descendant id (subtasks, recursively), for
// cascading hub operations like delete/archive.
export function collectWithDescendants(todos: Todo[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of todos) {
    if (t && t.parentId) {
      const arr = childrenByParent.get(t.parentId) ?? [];
      arr.push(t.id);
      childrenByParent.set(t.parentId, arr);
    }
  }
  const result = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!result.has(child)) { result.add(child); stack.push(child); }
    }
  }
  return result;
}

export interface OrganizerEntry {
  todo: Todo;
  // The task's scheduled day lives on `todo.dueDate` (the source of truth); this
  // wrapper just carries the todo so the read pipeline can attach derived data.
}

// Collect organizer entries from every day, optionally restricted to archived
// (or non-archived) todos. Results are ordered by hubOrder, falling back to
// createdAt so todos without an explicit order stay stable.
function collectOrganizer(
  dayTodos: DayTodos[],
  predicate: (todo: Todo) => boolean
): OrganizerEntry[] {
  const out: OrganizerEntry[] = [];
  for (const day of dayTodos || []) {
    for (const todo of day.todos || []) {
      if (todo && predicate(todo)) {
        out.push({ todo });
      }
    }
  }
  out.sort((a, b) =>
    (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt)
  );
  return out;
}

// Every todo across all days that belongs in the Task Planner (not archived).
export function getOrganizerTodos(dayTodos: DayTodos[]): OrganizerEntry[] {
  return collectOrganizer(dayTodos, showsInOrganizer);
}

// Every database todo that has been archived (for the future archived view).
export function getArchivedTodos(dayTodos: DayTodos[]): OrganizerEntry[] {
  return collectOrganizer(
    dayTodos,
    (todo) => todo.showInDatabase === true && todo.archived === true
  );
}

// ── Collections (positional membership via parentId) ────────────────────────
// A task's collection is its nearest `isCollection` ancestor. Subtasks therefore
// inherit their parent task's collection automatically, and a task belongs to
// every collection along the path (root → nearest). Collections nest under other
// collections via the same parentId.

// Index every todo by id (across all day buckets), for ancestor walks.
export function todoIndex(dayTodos: DayTodos[]): Map<string, Todo> {
  const m = new Map<string, Todo>();
  for (const d of dayTodos || []) {
    for (const t of d.todos || []) if (t) m.set(t.id, t);
  }
  return m;
}

// The id of the nearest collection ancestor of `todo`, or null if none.
export function collectionOf(todo: Todo, byId: Map<string, Todo>): string | null {
  let pid = todo.parentId ?? null;
  const seen = new Set<string>();
  while (pid && byId.has(pid) && !seen.has(pid)) {
    seen.add(pid);
    const p = byId.get(pid)!;
    if (p.isCollection) return p.id;
    pid = p.parentId ?? null;
  }
  return null;
}

// Root → leaf chain of collections ending at `collId` (for breadcrumb display).
export function collectionPath(collId: string | null, byId: Map<string, Todo>): Todo[] {
  const out: Todo[] = [];
  let id: string | null = collId;
  const seen = new Set<string>();
  while (id && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const c = byId.get(id)!;
    if (!c.isCollection) break;
    out.unshift(c);
    id = c.parentId ?? null;
  }
  return out;
}

export interface CollectionOption {
  id: string;
  name: string;
  color?: string;
  path: { id: string; name: string; color?: string }[]; // root → leaf, inclusive
}

// All collections (optionally scoped to a workspace) as searchable options with
// their breadcrumb path resolved.
export function collectionOptions(
  dayTodos: DayTodos[],
  byId: Map<string, Todo>,
  opts: { workspaceId?: string } = {}
): CollectionOption[] {
  const out: CollectionOption[] = [];
  for (const d of dayTodos || []) {
    for (const t of d.todos || []) {
      if (!t || !t.isCollection || t.archived === true) continue;
      if (opts.workspaceId && (t.workspaceId ?? 'personal') !== opts.workspaceId) continue;
      const path = collectionPath(t.id, byId).map((c) => ({
        id: c.id,
        name: c.text || 'Untitled',
        color: c.color,
      }));
      out.push({ id: t.id, name: t.text || 'Untitled', color: t.color, path });
    }
  }
  return out;
}

// Every todo that belongs on the daily checklist for a specific calendar date.
export function getDailyChecklistTodos(dayTodos: DayTodos[], date: string): Todo[] {
  if (!hasDate(date)) return [];
  const day = (dayTodos || []).find(d => d.date === date);
  return (day?.todos || []).filter(t => t && showsOnDailyChecklist(t, date));
}

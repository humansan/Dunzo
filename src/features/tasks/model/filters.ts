import { Todo, DayTodos } from '@shared/types';
import { collectionPath } from './ancestry';
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

// The start/due schedule invariant is likewise enforced on both sides of the wire
// (see shared/domain/todoSchedule.ts); re-exported here as the client's entry point.
export {
  reconcileSchedule,
  normalizeScheduleTimes,
  isScheduleValid,
  startAfterDue,
  touchesSchedule,
  type ScheduleSide,
} from '@shared/domain/todoSchedule';

// The archive invariant (an archived parent's children are archived too) is
// likewise shared with the server; same rationale, same entry point.
export {
  reconcileArchived,
  archiveConsistent,
  touchesArchive,
  descendantsToArchive,
  ancestorsToUnarchive,
} from '@shared/domain/todoArchive';

// ── Workspaces (currently disabled) ────────────────────────────────────────
//
// Workspaces are switched off: every todo the server hands back belongs to the
// signed-in user (all /api/todos queries are scoped by userId), and that single
// user-wide set is what the Task Planner shows. This predicate is the one place
// that decides it, so turning workspaces back on means flipping the flag here
// rather than re-deriving the rule at four call sites.
//
// It is off because scoping by `workspaceId ?? 'personal'` silently hid tasks:
// only the planner stamps a workspaceId on creation, and since the seeded default
// workspace now gets a RANDOM id (there is no fixed 'personal' id anymore), every
// daily-list task fell back to a workspace that no account actually has. If this
// is ever re-enabled, legacy rows with no workspaceId must be backfilled to the
// user's first workspace first - the `?? 'personal'` fallback is not a safe default.
export const WORKSPACES_ENABLED = false;

export function inWorkspace(todo: Todo, workspaceId: string): boolean {
  if (!WORKSPACES_ENABLED) return true;
  return (todo.workspaceId ?? '') === workspaceId;
}

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

// Every unarchived todo across all days, regardless of which surface(s) it shows
// on (Task Planner, daily checklist, or both). This is the universe the global
// search palette's flat list searches - a daily-list-only task (showInDatabase
// false) is still findable. Collections are included so subtree/ancestry walks
// keep working; the search core never treats them as hits.
export function getSearchableTodos(dayTodos: DayTodos[]): OrganizerEntry[] {
  return collectOrganizer(dayTodos, (todo) => todo.archived !== true);
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

// Every ancestry question - collectionOf, collectionPath, hasCollectionAncestor,
// isDescendantOf - is one upward walk with a different stopping condition, so they
// all live in ./ancestry over a single implementation. Re-exported here because
// this module is the client's entry point to the todo domain.
export {
  ancestorsOf,
  collectionOf,
  collectionPath,
  collectionAncestors,
  hasCollectionAncestor,
  isDescendantOf,
  nearestCollectionAt,
  type TodoIndex,
} from './ancestry';

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
      if (opts.workspaceId && !inWorkspace(t, opts.workspaceId)) continue;
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

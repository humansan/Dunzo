import { Todo } from '../types';

// ── Task Planner (organizer) vs. Daily checklist routing ────────────────────────
//
// There are two surfaces a todo can show up on:
//   • The daily checklist - a temporary, per-day board for everything you need
//     to do that day (important *and* throwaway: "take out the trash", "lunch").
//   • The Task Planner - a database-style organizer for important things you plan
//     ahead of time.
//
// Two independent booleans control visibility:
//   • showInDatabase - show in Task Planner
//   • showInDailyList - show in the daily checklist for the date it is filed under
//
// Every new task defaults to BOTH flags true, regardless of where it is created
// (Task Planner, daily list, or a calendar block) - so it shows in the Planner and,
// once it has a due date, on that day's daily checklist. The two toggles are then an
// opt-OUT to hide a task from one surface (the invariant below keeps at least one on).
// Collections are the exception: they are database-only (showInDatabase=true, no daily
// flag). A Planner task with no date carries showInDailyList=true harmlessly - it only
// reaches the daily checklist once a date is assigned (see showsOnDailyChecklist).
//
//   showInDatabase | showInDailyList | has date | Daily checklist | Task Planner
//   ---------------|-----------------|----------|-----------------|-----------
//        true      |     false       |   any    |       no        |    yes
//        true      |     true        |   yes    |      yes        |    yes
//        false     |     true        |   yes    |      yes        |    no
//
// A missing flag reads as false - every todo carries explicit flags now (the old
// localStorage data has been migrated). Invariant: a todo must be REACHABLE - on
// one of the two surfaces above, or, for a subtask, inside its parent. It is
// enforced at the write boundary by normalizeVisibility below on the client and
// again by enforceVisibility (server/http.ts) on the server - which is why these
// rules live in `shared/` rather than in either tree.
//
// The parent clause is what makes the Planner invariant next door possible (see
// todoPlannerVisibility.ts: a hidden parent hides its subtree). Without it the two
// rules deadlock - hiding a dateless subtask would trip the rescue below, force it
// back into the Planner, and immediately re-break the parent/child rule. It is
// also simply true: TodoFullView's subtask list filters on `archived` alone, so a
// Planner-hidden subtask is still right there inside the task it belongs to.
//
// It means a TASK parent specifically. A collection is not a surface in this
// sense: the Planner tree renders collections, but it renders only the VISIBLE
// todos inside them, so a hidden task filed under one would be reachable by search
// alone. A todo under a collection is treated as a root here, and so is an actual
// root - the "both false" orphan the rescue was written for in the first place.
//
// Dates live on the `DayTodos` wrapper, not the todo itself. A todo with "no
// date assigned" is one filed under the UNDATED bucket below (same dayTodos
// array, so existing persistence keeps working); a dated todo is one filed
// under a real YYYY-MM-DD key.

// Sentinel date key for todos that have no calendar date assigned. These live
// in the same dayTodos array as dated todos but never appear on the daily
// checklist - only in the Task Planner.
export const UNDATED = '__undated__';

// True when the given DayTodos key represents a real calendar date (as opposed
// to the UNDATED bucket or an empty/missing key).
export const hasDate = (date: string): boolean => !!date && date !== UNDATED;

// Whether a todo filed under `date` should appear on the daily checklist: it
// needs a real date and an explicit showInDailyList flag.
export function showsOnDailyChecklist(todo: Todo, date: string): boolean {
  return hasDate(date) && todo.showInDailyList === true;
}

// Whether a todo should appear in the Task Planner (organizer). Only todos
// explicitly flagged showInDatabase qualify - dated or not - and not archived.
export function showsInOrganizer(todo: Todo): boolean {
  return todo.showInDatabase === true && todo.archived !== true;
}

// Enforce the visibility invariant on a todo about to be persisted: every todo
// must be reachable. The two flags are otherwise free to combine (planner-only,
// daily-only, both, or neither for a subtask), and the date dependency is left
// intact - this only rescues the one illegal outcome, a todo that would render
// nowhere. It deliberately does NOT fabricate flags on todos that are already
// reachable.
//
// `parent` is the todo's CURRENT parent row (undefined/null when it has none or it
// couldn't be resolved), because only the row itself answers the question that
// matters: a TASK parent is a surface (its full view lists its subtasks), a
// COLLECTION is not (the Planner tree renders collections, but it only renders the
// VISIBLE todos inside them - a hidden task under a collection would be reachable
// by search alone). `parentId` therefore has to be part of the merged state handed
// to this function; it is one of the VISIBILITY_KEYS (server/http.ts) for the same
// reason. Omitting `parent` falls back to the stricter root-only rule, which errs
// toward showing a todo that didn't need it rather than hiding one that did.
export function normalizeVisibility(todo: Todo, parent?: Todo | null): Todo {
  // Collections are database-only folders; they never belong on the daily list.
  if (todo.isCollection) {
    return todo.showInDatabase === true ? todo : { ...todo, showInDatabase: true };
  }
  // A database todo is always reachable - in the Planner, or the archived view.
  if (todo.showInDatabase === true) return todo;
  // Otherwise it must earn its place on the daily checklist, which needs a date.
  if (showsOnDailyChecklist(todo, todo.dueDate ?? '')) return todo;
  // A subtask needs neither: it is reachable inside its parent task's full view,
  // which is what lets a hidden parent take its whole subtree out of the Planner.
  if (parent && !parent.isCollection) return todo;
  // A root todo that would vanish everywhere (e.g. a daily-only todo whose date
  // was cleared, or a subtask just pulled out to the root) - surface it in the
  // Task Planner so it stays reachable.
  return { ...todo, showInDatabase: true };
}

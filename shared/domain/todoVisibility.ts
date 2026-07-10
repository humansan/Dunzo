import { Todo } from '../types';

// ── Task Planner (organizer) vs. Daily checklist routing ────────────────────────
//
// There are two surfaces a todo can show up on:
//   • The daily checklist — a temporary, per-day board for everything you need
//     to do that day (important *and* throwaway: "take out the trash", "lunch").
//   • The Task Planner — a database-style organizer for important things you plan
//     ahead of time.
//
// Two independent booleans control visibility:
//   • showInDatabase — show in Task Planner
//   • showInDailyList — show in the daily checklist for the date it is filed under
//
// Tasks created in the Task Planner default to showInDatabase=true, showInDailyList=false.
// Tasks created in the daily list default to showInDailyList=true (no showInDatabase).
// To show a Task Planner task on a specific day, assign a date and enable the
// "Send to daily list" toggle in the date picker (sets showInDailyList=true).
//
//   showInDatabase | showInDailyList | has date | Daily checklist | Task Planner
//   ---------------|-----------------|----------|-----------------|-----------
//        true      |     false       |   any    |       no        |    yes
//        true      |     true        |   yes    |      yes        |    yes
//        false     |     true        |   yes    |      yes        |    no
//
// A missing flag reads as false — every todo carries explicit flags now (the old
// localStorage data has been migrated). Invariant: a todo must be reachable on at
// least one surface (the "both false" / daily-only-without-a-date orphan is
// illegal). It is enforced at the write boundary by normalizeVisibility below on
// the client and again by enforceVisibility (server/http.ts) on the server — which
// is why these rules live in `shared/` rather than in either tree.
//
// Dates live on the `DayTodos` wrapper, not the todo itself. A todo with "no
// date assigned" is one filed under the UNDATED bucket below (same dayTodos
// array, so existing persistence keeps working); a dated todo is one filed
// under a real YYYY-MM-DD key.

// Sentinel date key for todos that have no calendar date assigned. These live
// in the same dayTodos array as dated todos but never appear on the daily
// checklist — only in the Task Planner.
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
// explicitly flagged showInDatabase qualify — dated or not — and not archived.
export function showsInOrganizer(todo: Todo): boolean {
  return todo.showInDatabase === true && todo.archived !== true;
}

// Enforce the visibility invariant on a todo about to be persisted: every todo
// must be reachable on at least one surface. The two flags are otherwise free to
// combine (planner-only, daily-only, both), and the date dependency is left
// intact — this only rescues the one illegal outcome, a todo that would render
// nowhere. It deliberately does NOT fabricate flags on todos that are already
// visible somewhere.
export function normalizeVisibility(todo: Todo): Todo {
  // Collections are database-only folders; they never belong on the daily list.
  if (todo.isCollection) {
    return todo.showInDatabase === true ? todo : { ...todo, showInDatabase: true };
  }
  // A database todo is always reachable — in the Planner, or the archived view.
  if (todo.showInDatabase === true) return todo;
  // Otherwise it must earn its place on the daily checklist, which needs a date.
  if (showsOnDailyChecklist(todo, todo.dueDate ?? '')) return todo;
  // Would vanish everywhere (e.g. a daily-only todo whose date was cleared) —
  // surface it in the Task Planner so it stays reachable.
  return { ...todo, showInDatabase: true };
}

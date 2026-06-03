import { Todo, DayTodos } from '../types';

// ── Task Planner (organizer) vs. Daily checklist routing ────────────────────────
//
// There are two surfaces a todo can show up on:
//   • The daily checklist — a temporary, per-day board for everything you need
//     to do that day (important *and* throwaway: "take out the trash", "lunch").
//   • The Task Planner — a database-style organizer for important things you plan
//     ahead of time.
//
// A single boolean on the todo, `showInDatabase`, plus whether the todo has a
// date assigned, decides where it appears. There is intentionally NO two-way
// sync: these helpers just read the existing data and decide visibility.
//
//   showInDatabase | has date | Daily checklist | Task Planner
//   ---------------|----------|-----------------|-----------
//        true      |   no     |       no        |    yes
//        true      |   yes    |      yes        |    yes
//        false     |   any    |      yes*       |    no
//
//   * a `false` todo only ever shows on the day it's filed under; a dateless
//     `false` todo has no day to live on, so it shows nowhere.
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

// Whether a todo filed under `date` should appear on the daily checklist.
// Every dated todo does, regardless of showInDatabase; undated todos never do.
export function showsOnDailyChecklist(_todo: Todo, date: string): boolean {
  return hasDate(date);
}

// Whether a todo should appear in the Task Planner (organizer). Only todos
// explicitly flagged showInDatabase qualify — dated or not — and not archived.
export function showsInOrganizer(todo: Todo): boolean {
  return todo.showInDatabase === true && todo.archived !== true;
}

export interface OrganizerEntry {
  todo: Todo;
  date: string | null; // the real calendar date, or null when none is assigned
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
        out.push({ todo, date: hasDate(day.date) ? day.date : null });
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

// Every todo that belongs on the daily checklist for a specific calendar date.
export function getDailyChecklistTodos(dayTodos: DayTodos[], date: string): Todo[] {
  if (!hasDate(date)) return [];
  const day = (dayTodos || []).find(d => d.date === date);
  return (day?.todos || []).filter(t => t && showsOnDailyChecklist(t, date));
}

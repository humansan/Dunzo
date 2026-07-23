import { Todo } from '../types';

// ── Task schedule invariant (start/due dates + times) ───────────────────────────
//
// A todo carries two temporal sides, start and due, each a date + time (+ a
// percent-of-day twin of the time). `dueDate` is the scheduling anchor - it drives
// the daily-list day - while `startDate` is descriptive. Two rules keep the pair
// coherent everywhere they can be edited:
//
//   1. A TIME requires a DATE on its own side. There are no dateless-but-timed
//      tasks: a start time only exists with a start date, a due time only with a
//      due date. (A date WITHOUT a time is fine - an all-day side.)
//   2. START must never be after DUE.
//
// These live in `shared/` so the exact same rule runs on the client (composed into
// the write chain, and interactively in the editors) and on the server (an
// authoritative backstop), mirroring normalizeVisibility in ./todoVisibility.
//
// Rule 2 is enforced two different ways, deliberately:
//   - Interactive editors REJECT a violating edit outright (isScheduleValid), so
//     the side the user did NOT touch is never moved under them.
//   - Bulk/backstop writes CORRECT it (reconcileSchedule), because "ignore the
//     edit" has no meaning for a batch upsert or a server-merged partial patch.

export type ScheduleSide = 'start' | 'due';

// The fields that can break the invariant. A patch touching none of these can't,
// so the server can skip the merged-row check (mirrors touchesVisibility). Also
// the exact set of keys the server backstop folds back into a corrected write.
export const SCHEDULE_KEYS = [
  'startDate',
  'startTime',
  'startPercentage',
  'dueDate',
  'dueTime',
  'duePercentage',
] as const;

export function touchesSchedule(patch: object): boolean {
  return SCHEDULE_KEYS.some((k) => k in patch);
}

// Parse an `HH:MM` (1-2 digit hour) time to minutes-since-midnight, or undefined
// when absent/unparseable. Local to shared/ - can't reach src/common/lib/time.
function timeMinutes(time?: string): number | undefined {
  if (!time) return undefined;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Whether the todo's start lies strictly after its due. Only meaningful when both
// dates are present - and since a time requires its date (rule 1), that covers
// every case where the two sides can actually conflict. Dates (YYYY-MM-DD, so
// lexicographic == chronological) are compared first; an equal-date pair is
// compared on times only when BOTH are set. A side with a date but no time never
// conflicts, so we never fabricate a time to order it.
export function startAfterDue(t: Todo): boolean {
  if (!t.startDate || !t.dueDate) return false;
  if (t.startDate > t.dueDate) return true;
  if (t.startDate < t.dueDate) return false;
  const s = timeMinutes(t.startTime);
  const d = timeMinutes(t.dueTime);
  return s !== undefined && d !== undefined && s > d;
}

// Rule 1 on its own: drop an orphan time (and its percent twin) whose side has no
// date. Split out of reconcileSchedule so the interactive editors can build the
// candidate an edit produces WITHOUT Rule 2's nudge - they reject an out-of-order
// pair instead of moving the untouched side to meet it. Clearing a due date still
// has to drop the orphan due time, which is why this half stays automatic.
export function normalizeScheduleTimes(todo: Todo): Todo {
  if (todo.isCollection) return todo;

  let t = todo;
  if (!t.startDate && (t.startTime !== undefined || t.startPercentage !== undefined)) {
    t = { ...t, startTime: undefined, startPercentage: undefined };
  }
  if (!t.dueDate && (t.dueTime !== undefined || t.duePercentage !== undefined)) {
    t = { ...t, dueTime: undefined, duePercentage: undefined };
  }
  return t;
}

// Whether `todo` satisfies Rule 2 once orphan times are dropped. The editors gate
// every schedule edit on this and discard the ones that fail, so a user's input is
// never silently rewritten. Rule 1 is applied first because dropping an orphan
// time can itself resolve an apparent same-day conflict.
export function isScheduleValid(todo: Todo): boolean {
  if (todo.isCollection) return true;
  return !startAfterDue(normalizeScheduleTimes(todo));
}

// Return a copy of `todo` corrected to satisfy the schedule invariant.
//
// `editedSide` names the side the user just changed, so ordering conflicts move
// the OTHER side to meet it ("set start later than due bumps due up"; "set due
// earlier than start pulls start down"). Omit it for a backstop write (a partial
// patch merged server-side, a bulk upsert) where the direction is unknown: due is
// authoritative there - it anchors scheduling - so start is pulled back to due.
export function reconcileSchedule(todo: Todo, editedSide?: ScheduleSide): Todo {
  // Collections ignore the task date/time fields entirely.
  if (todo.isCollection) return todo;

  // Rule 1 - drop an orphan time (and its percent twin) whose side has no date.
  let t = normalizeScheduleTimes(todo);

  // Rule 2 - order the pair. Equalize the offending side's date first, then only
  // touch its time if a same-day time conflict remains (so a purely date-level
  // fix preserves an otherwise-fine time on the moved side).
  if (startAfterDue(t)) {
    if (editedSide === 'start') {
      t = { ...t, dueDate: t.startDate };
      if (startAfterDue(t)) t = { ...t, dueTime: t.startTime, duePercentage: t.startPercentage };
    } else {
      // 'due' or backstop: pull start down to due.
      t = { ...t, startDate: t.dueDate };
      if (startAfterDue(t)) t = { ...t, startTime: t.dueTime, startPercentage: t.duePercentage };
    }
  }

  return t;
}

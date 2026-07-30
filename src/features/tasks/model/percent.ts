import { Todo } from '@shared/types';
import { timeToPercentage } from '@/common/lib/time';

// ── Percent of day (a view of a time, never a stored value) ─────────────────
//
// The "Start %" / "End %" columns and the % half of every time chip are two
// representations of ONE value: the time. They used to be persisted side by side
// (startPercentage / duePercentage), which meant every write path had to remember
// to update both - and three of them didn't, leaving tasks showing a percentage
// for a time they no longer had. Deriving removes the class of bug entirely.
//
// Percent input goes the other way through percentageToTime (see patchFromPercent
// in ../fields/todoFields.tsx): a percent is snapped to the nearest minute, so
// typing 33% stores 07:55 and reads back as 32.99. Always render through
// percentLabel - never the raw float.

// The primitive: an "HH:MM" (or nothing) as its percent of the day.
export const percentOfDay = (time: string | undefined): number | undefined =>
  time ? timeToPercentage(time) : undefined;

export const startPercent = (todo: Pick<Todo, 'startTime'>) => percentOfDay(todo.startTime);
export const duePercent = (todo: Pick<Todo, 'dueTime'>) => percentOfDay(todo.dueTime);

// Display form: whole percent, '' when there's no time. The minute-snapping above
// is why this rounds - 33% must read back as "33%", not "32.99%".
export const percentLabel = (pct: number | undefined): string =>
  pct === undefined ? '' : `${Math.round(pct)}%`;

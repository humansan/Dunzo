import { Todo } from '@shared/types';
import { UNDATED } from '@/features/tasks/model';

// ─── All-day (untimed) tasks ────────────────────────────────────────────────
// A task with a date but no time can't be placed on the time grid - there is no
// minute to draw it at. The schedule invariant treats that as legal, deliberate
// data ("a date WITHOUT a time is fine - an all-day side", shared/domain/todoSchedule.ts),
// so those tasks get their own row pinned under the date headers instead of being
// dropped on the floor, the way Google/Notion handle all-day events.
//
// Same split as span.ts: this module owns the rules and the minute/px arithmetic,
// the component owns the DOM.

// A chip's height sits between a 15-minute block (13px) and a 30-minute one (28px)
// in the grid. Those numbers come from EventCard's `max(minutesToPx(len), 15) - 2`
// at 1px per minute (HOUR_HEIGHT = 60), so they move only if that scale does.
export const ALL_DAY_CHIP_HEIGHT = 20;
export const ALL_DAY_CHIP_GAP = 2;
export const ALL_DAY_PAD_Y = 4;

// Which column an untimed task belongs in. dueDate is the app's scheduling anchor
// (it's what buckets a task and what the daily list reads), so it wins; a task that
// only ever got a start date still has somewhere to live.
export const allDayDateOf = (t: Todo): string | null => {
  if (t.dueDate && t.dueDate !== UNDATED) return t.dueDate;
  if (t.startDate) return t.startDate;
  return null;
};

// Dated, but with no time on either side. Collections are excluded outright: they
// are Planner containers, not schedulable work. The grid never needed that guard -
// its "must have a time" test happened to exclude them - but this row would show
// them, since a collection can carry a date.
export const isUntimedDated = (t: Todo): boolean =>
  !t.isCollection && !t.startTime && !t.dueTime && allDayDateOf(t) !== null;

// Row order: the daily list's order first, then the Planner's, exactly as those two
// surfaces sort themselves (app-data.tsx groupByDueDate, tasks/model/filters.ts).
//
// The two are never mixed into one number. dailyOrder and hubOrder are independent
// scales - and hubOrder falls back to createdAt (epoch ms) - so subtracting across
// them would interleave nonsensically. Tasks carrying a dailyOrder sort first, in
// that order; everything else follows in hub order.
export const compareAllDay = (a: Todo, b: Todo): number => {
  const ad = a.dailyOrder ?? Infinity;
  const bd = b.dailyOrder ?? Infinity;
  if (ad !== bd) return ad - bd;
  return (a.hubOrder ?? a.createdAt) - (b.hubOrder ?? b.createdAt);
};

// Height of the row: tall enough for the busiest visible day, always - it grows
// without limit rather than scrolling or hiding tasks behind a "+N more".
//
// An empty row still takes one slot's worth. It has to stay a visible drop target
// (dragging a task UP out of the grid needs somewhere to aim), and a row that
// collapsed to nothing would shift the whole grid every time a day emptied out.
export const allDayRowHeight = (maxCount: number): number => {
  const n = Math.max(maxCount, 1);
  return ALL_DAY_PAD_Y * 2 + n * ALL_DAY_CHIP_HEIGHT + (n - 1) * ALL_DAY_CHIP_GAP;
};

// Top offset of the nth chip in a column.
export const allDayChipTop = (index: number): number =>
  ALL_DAY_PAD_Y + index * (ALL_DAY_CHIP_HEIGHT + ALL_DAY_CHIP_GAP);

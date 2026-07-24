import { format, addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { Todo } from '@shared/types';
import { minutesToTime, timeToPercentage } from '@/common/lib/time';

// ── The calendar's absolute-minute timeline ─────────────────────────────────
//
// A task carries two date+time sides. Rendering and dragging both need to reason
// about them as one continuous range, so everything here converts a date-stamped
// time into "minutes since a fixed epoch day". Crossing midnight is then ordinary
// arithmetic instead of a pile of per-day special cases, and decomposeSpan turns
// the result back into the persisted fields.
//
// Kept out of CalendarView.tsx so it can be reasoned about (and tested) without a
// DOM: the component keeps pixels, the module keeps minutes.

export const MINS_PER_DAY = 1440;

// The longest span the calendar draws: two calendar days, i.e. through 23:59 of the
// day after the start. Longer tasks aren't rendered at all (the all-day bar across
// the header isn't built yet) and drag/resize clamp to this so one can't be made.
export const MAX_SPAN_MINS = 2 * MINS_PER_DAY - 1;

// Day indices go through differenceInCalendarDays/addDays rather than dividing
// milliseconds, so a DST shift can never slide a task onto the wrong day.
const DAY_EPOCH = new Date(2000, 0, 1);

export function dayIndex(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), DAY_EPOCH);
}

export function dateStrFromIndex(idx: number): string {
  return format(addDays(DAY_EPOCH, idx), 'yyyy-MM-dd');
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export type TodoSpan = { absStart: number; absEnd: number };

export type Segment = {
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

// An end sitting exactly on a midnight boundary belongs to the day that just ended
// (23:59), not as a zero-length sliver at the top of the next one - the same
// convention minutesToTime applies when it clamps 1440 to 23:59.
export function normalizeSpanEnd(span: TodoSpan): TodoSpan {
  const { absStart } = span;
  let { absEnd } = span;
  if (absEnd > absStart && absEnd % MINS_PER_DAY === 0) absEnd -= 1;
  return { absStart, absEnd };
}

// A todo's absolute bounds, or null when it can't be placed on the grid.
//
// Same-day tasks keep the long-standing 30-minute default for a missing side
// (start-only → start..start+30, end-only → end-30..end) so a one-sided task still
// gets a block. When startDate is an EARLIER day the task is a span, and a missing
// time means that side is all-day: it runs from 00:00, or through the end of its day.
export function todoSpan(todo: Todo): TodoSpan | null {
  if (!todo.dueDate) return null;
  if (!todo.startTime && !todo.dueTime) return null;
  const dueIdx = dayIndex(todo.dueDate);
  const startIdx = todo.startDate ? dayIndex(todo.startDate) : dueIdx;
  const diff = dueIdx - startIdx;
  if (diff < 0) return null; // start after due - the schedule invariant forbids it

  if (diff === 0) {
    const startMin = todo.startTime
      ? timeToMinutes(todo.startTime)
      : Math.max(0, timeToMinutes(todo.dueTime!) - 30);
    let endMin = todo.dueTime ? timeToMinutes(todo.dueTime) : startMin + 30;
    // Equal start/end is a real 0-minute task; only an inverted pair is corrected.
    if (endMin < startMin) endMin = startMin;
    const base = dueIdx * MINS_PER_DAY;
    return normalizeSpanEnd({ absStart: base + startMin, absEnd: base + endMin });
  }

  return normalizeSpanEnd({
    absStart: startIdx * MINS_PER_DAY + (todo.startTime ? timeToMinutes(todo.startTime) : 0),
    absEnd: dueIdx * MINS_PER_DAY + (todo.dueTime ? timeToMinutes(todo.dueTime) : MINS_PER_DAY),
  });
}

// How many day columns a span touches. Only 1 and 2 are renderable.
export function spanDayCount(span: TodoSpan): number {
  return Math.floor(span.absEnd / MINS_PER_DAY) - Math.floor(span.absStart / MINS_PER_DAY) + 1;
}

// The slice of `span` falling on `dateStr`, or null when it doesn't reach that day.
// A day the span passes through runs edge to edge; the continues* flags tell the card
// to square that corner and drop its resize handle there, since the midnight seam is
// not a real edge of the task.
export function segmentFor(span: TodoSpan, dateStr: string): Segment | null {
  const dayStart = dayIndex(dateStr) * MINS_PER_DAY;
  const dayEnd = dayStart + MINS_PER_DAY;
  if (span.absEnd < dayStart || span.absStart >= dayEnd) return null;
  return {
    startMin: Math.max(span.absStart, dayStart) - dayStart,
    endMin: Math.min(span.absEnd, dayEnd) - dayStart,
    continuesBefore: span.absStart < dayStart,
    continuesAfter: span.absEnd >= dayEnd,
  };
}

// Move a span by `delta` minutes, preserving its length and never letting it reach a
// third day (a long span nudged forward would otherwise spill past the 2-day cap).
export function shiftSpan(span: TodoSpan, delta: number): TodoSpan {
  const duration = span.absEnd - span.absStart;
  let absStart = Math.max(0, span.absStart + delta);
  const maxOffset = MAX_SPAN_MINS - duration;
  if (maxOffset >= 0) {
    const dayStart = Math.floor(absStart / MINS_PER_DAY) * MINS_PER_DAY;
    absStart = Math.min(absStart, dayStart + maxOffset);
  }
  return { absStart, absEnd: absStart + duration };
}

// Move one edge of a span. The other side keeps its original value, so a resize
// writes back only the side that was dragged. Collapsing to zero is allowed (equal
// start/end is a real 0-minute task); the MAX_SPAN_MINS clamp stops the dragged edge
// from reaching a third day while still letting it cross midnight.
export function resizeSpan(span: TodoSpan, edge: 'top' | 'bottom', delta: number): TodoSpan {
  if (edge === 'top') {
    let absStart = Math.min(Math.max(0, span.absStart + delta), span.absEnd);
    absStart = Math.max(absStart, span.absEnd - MAX_SPAN_MINS);
    return { absStart, absEnd: span.absEnd };
  }
  let absEnd = Math.max(span.absStart, span.absEnd + delta);
  absEnd = Math.min(absEnd, span.absStart + MAX_SPAN_MINS);
  return { absStart: span.absStart, absEnd };
}

// Absolute span → the six persisted schedule fields.
export function decomposeSpan(span: TodoSpan): Partial<Todo> {
  const { absStart, absEnd } = normalizeSpanEnd(span);
  const sIdx = Math.floor(absStart / MINS_PER_DAY);
  const eIdx = Math.floor(absEnd / MINS_PER_DAY);
  const startTime = minutesToTime(absStart - sIdx * MINS_PER_DAY);
  const dueTime = minutesToTime(absEnd - eIdx * MINS_PER_DAY);
  return {
    startDate: dateStrFromIndex(sIdx),
    startTime,
    startPercentage: timeToPercentage(startTime),
    dueDate: dateStrFromIndex(eIdx),
    dueTime,
    duePercentage: timeToPercentage(dueTime),
  };
}

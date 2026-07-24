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

// The longest task the calendar draws: 24 hours. Anything longer is a multi-day
// task and belongs in the all-day bar across the header, which isn't built yet, so
// those aren't rendered at all (see isRenderableSpan). Drag and resize clamp to
// this, so an edge stops at 24h rather than silently pushing the task out of view.
//
// This one rule also bounds the grid to two day columns, which is why no separate
// day-count cap is needed: a span of at most 24h starting at worst 23:59 ends at
// 23:59 the next day, so it can never touch a third. Capping *duration* is the fix
// for the older `2 * MINS_PER_DAY - 1` cap, which capped length rather than days and
// therefore let an end dragged from an early start land on a third day - where the
// renderer dropped the task and it vanished.
export const MAX_SPAN_MINS = MINS_PER_DAY;

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
  if (!todo.startTime && !todo.dueTime) return null;

  // A task normally anchors on its due date. One with ONLY a start side - a start
  // date and time, no due date at all - anchors on its START date instead, so it
  // gets the same 30-minute block an end-only task gets. Anchoring solely on
  // dueDate used to drop these entirely, which is why an end-only task drew a block
  // but a start-only one silently didn't. The end is clamped to the end of its own
  // day, mirroring how the end-only default clamps its start at 00:00: a task with
  // no due side shouldn't spill a phantom segment into the next day.
  if (!todo.dueDate) {
    if (!todo.startDate || !todo.startTime) return null; // a time needs its own date
    const base = dayIndex(todo.startDate) * MINS_PER_DAY;
    const startMin = timeToMinutes(todo.startTime);
    return normalizeSpanEnd({
      absStart: base + startMin,
      absEnd: base + Math.min(startMin + 30, MINS_PER_DAY),
    });
  }

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

export function spanDuration(span: TodoSpan): number {
  return span.absEnd - span.absStart;
}

// Whether the calendar draws this span at all. Over 24h is a multi-day task, which
// belongs in the (not yet built) all-day header bar rather than the time grid. The
// day-count check is redundant given the duration cap - it's kept as a cheap guard
// for stored data that predates the cap.
export function isRenderableSpan(span: TodoSpan): boolean {
  return spanDuration(span) <= MAX_SPAN_MINS && spanDayCount(span) <= 2;
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

// Move a span by `delta` minutes, preserving its length. Needs no span cap of its
// own: a move never changes duration, and a task longer than MAX_SPAN_MINS isn't
// rendered, so it has no handles to grab in the first place. (The previous version
// clamped the start against a day-offset budget here, which could snap a long task
// backwards for no reason.)
export function shiftSpan(span: TodoSpan, delta: number): TodoSpan {
  const duration = span.absEnd - span.absStart;
  const absStart = Math.max(0, span.absStart + delta);
  return { absStart, absEnd: absStart + duration };
}

// Move one edge of a span. The other side keeps its original value, so a resize
// writes back only the side that was dragged. Collapsing to zero is allowed (equal
// start/end is a real 0-minute task), and the edge may cross midnight freely; the
// MAX_SPAN_MINS clamp simply stops it at 24h, so the task stays renderable instead
// of quietly growing past the limit and disappearing.
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

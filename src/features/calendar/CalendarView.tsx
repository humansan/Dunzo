import React, { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  format,
  addDays,
  parseISO,
  isToday,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { Todo, DayTodos } from '@shared/types';
import { btnNeutral } from '@/theme/buttons';
import { formatTime12h, minutesToTime } from '@/common/lib/time';
import { isDone } from '@/features/tasks/model';
import { collectionOf, todoIndex, UNDATED } from '@/features/tasks/model';
import { collectionColor } from '@/theme/collectionColor';
import { Calendar } from '@/common/ui/Calendar';
import { Checkbox } from '@/common/ui/Checkbox';
import { useSyncedCalendarFilter } from '@/lib/query/settings';
import { CollectionTree } from '@/features/planner/sidebar/CollectionTree';
import { useCollectionTree, taskCollectionAncestors } from './useCollectionTree';
import {
  MINS_PER_DAY,
  dayIndex,
  dateStrFromIndex,
  timeToMinutes,
  todoSpan,
  segmentFor,
  shiftSpan,
  resizeSpan,
  decomposeSpan,
  normalizeSpanEnd,
  isRenderableSpan,
  hasStartPoint,
  hasDuePoint,
  type TodoSpan,
} from './span';
import { AllDayRow, type AllDayItem } from './AllDayRow';
import {
  allDayDateOf,
  isUntimedDated,
  compareAllDay,
  allDayRowHeight,
  ALL_DAY_DROP_DURATION_MINS,
} from './allDay';

// ─── Helpers ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const GUTTER_WIDTH = 64; // px - width of the left time-label gutter (the day grid + current-time line start here)
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_OPTIONS = [1, 3, 5, 7];

// ─── Overlap cascade tuning ──────────────────────────────────────────────────
// Overlapping events are staggered Google-Calendar style: a later-starting event
// indents right and stacks on top, leaving the earlier one's left edge visible.
const INDENT_STEP_PCT = 15;  // % of the column each indent level shifts right
const MAX_LEVELS = 5;       // cap so deep stacks stop indenting instead of overflowing
const Z_EVENT_BASE = 10;    // resting z for a level-0 card (matches the old flat z-10)
const Z_EVENT_HOVER = 40;   // hovered card jumps here - above siblings, below the drag ghost (z-50)
const HOVER_RAISE_DELAY_MS = 400; // dwell before a hovered card lifts, so passing over one doesn't bury an indented card

function minutesToPx(mins: number): number {
  return (mins / 60) * HOUR_HEIGHT;
}

// The four fields a calendar write ever touches. A key set to undefined means
// "clear it" - nullifyUndefined turns that into a SQL NULL at the request boundary -
// so the keys are always present, never omitted.
type SchedulePatch = Pick<Todo, 'startDate' | 'startTime' | 'dueDate' | 'dueTime'>;
const SCHEDULE_KEYS = ['startDate', 'startTime', 'dueDate', 'dueTime'] as const;

// Where a settling ghost is drawn: at a span in the time grid, or as a chip in the
// all-day row (which has no time to place it at, only a column).
type SettlePlacement =
  | { kind: 'grid'; span: TodoSpan }
  | { kind: 'allday'; dateStr: string };

// Assign each event a cascade indent lane, Notion-style: the smallest lane not
// currently occupied by an earlier-starting event it overlaps (two events overlap
// when a.startMin < b.endMin && b.startMin < a.endMin). Because a lane is reclaimed
// the moment its occupant ends, an event that clears everything before it drops back
// to lane 0 (full width) even while a still-running neighbour sits indented above it
// - matching how Notion/Google reuse freed columns. Overlapping events always land
// in distinct lanes, so higher lanes indent further and (via z) stack on top.
function computeOverlapLayout(
  items: { id: string; startMin: number; endMin: number }[],
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const levels = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const taken = new Set<number>();
    for (let j = 0; j < i; j++) {
      const e = sorted[j];
      if (e.startMin < sorted[i].endMin && sorted[i].startMin < e.endMin) {
        taken.add(levels.get(e.id) ?? 0);
      }
    }
    let level = 0;
    while (taken.has(level)) level++;
    levels.set(sorted[i].id, level);
  }
  return levels;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}



function formatDuration(totalMins: number): string {
  const duration = Math.max(0, totalMins);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);

  return parts.length > 0 ? parts.join(' ') : '0 minutes';
}

// A full-width surface toggle row for the calendar sidebar: the shared Checkbox plus a
// constant-styled label (font-medium, steady color - it does NOT brighten when checked;
// the box alone signals state).
const SurfaceCheck: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <Checkbox checked={checked} onChange={onChange} className="w-full py-1" aria-label={label}>
    <span className="truncate text-xs text-fg-muted">{label}</span>
  </Checkbox>
);

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface CalendarViewProps {
  dayTodos: DayTodos[];
  // Per-row writes, shared with the planner / daily list / full view so an edit made
  // here gets the same normalization and the same subtask prompts.
  onSaveTodo: (todo: Todo) => void;
  onToggleTodo: (id: string) => void;
  initialDate?: string;
  initialDays?: number;
  hideHeader?: boolean;
  hideMiniCalendar?: boolean;
  // Write-back so the focused day (?date) is deep-linkable; the route wires it.
  onFocusDateChange?: (date: string) => void;
  // Drawing a block creates the task and returns its id; clicking a block (or the
  // freshly created one) opens it in the task full view.
  //
  // `surfaces` reports which surfaces this calendar is currently SHOWING, so the
  // new task can be given the flags that keep it on screen where it was drawn. The
  // caller decides whether that's the right question for it: the calendar page
  // uses it, the daily screen's embedded calendar ignores it and applies the daily
  // creation defaults, because a task drawn on the daily screen is a daily task
  // regardless of what the (shared) calendar filter was last set to.
  onCreateTask: (
    date: string,
    startTime: string,
    dueTime: string,
    surfaces: { daily: boolean; planner: boolean }
  ) => string;
  // Whether `surfaces` above actually decides what the new task gets. True (the
  // default) for the calendar page, where a drawn task takes the surfaces on
  // screen - and where a calendar showing NEITHER therefore has nothing to give
  // it, so drawing is switched off. An embedder that ignores `surfaces` and
  // applies its own creation policy passes false: the daily screen's 1-day
  // calendar always makes a daily task, so the (shared) surface filter has no say
  // over creating there and must not be able to disable it.
  surfacesGovernCreate?: boolean;
  onOpenTask: (id: string) => void;
}

// ─── Event Card ─────────────────────────────────────────────────────────────

const EventCard: React.FC<{
  todo: Todo;
  startMin: number;
  endMin: number;
  // CSS color driving the card's fill, spine and dot - see accentForTodo.
  accent: string;
  // Cascade indent: 0 = full-width (default). A higher level shifts the card right
  // and stacks it on top, so overlapping earlier cards stay partly visible.
  indentLevel?: number;
  onMouseDown?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, edge: 'top' | 'bottom') => void;
  isDragging?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
  // Set on a 2-day span's segments: this card runs off the top/bottom of its column
  // into the adjacent day. Squares that corner and removes the resize handle there,
  // since the midnight seam isn't a real edge of the task.
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  // The whole task's length. Segments show the total, not their own slice.
  durationMins?: number;
}> = ({
  todo, startMin, endMin, accent, indentLevel = 0, onMouseDown, onResizeStart, isDragging, onToggle,
  continuesBefore = false, continuesAfter = false, durationMins,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  // The z-lift is deliberately lagged behind the hover: a card the cursor is only
  // passing through on its way to an indented one shouldn't jump in front of it.
  // Visual hover feedback (fill, toggle dot) stays immediate.
  const [isRaised, setIsRaised] = useState(false);
  const raiseTimer = useRef<number | null>(null);
  const cancelRaise = () => {
    if (raiseTimer.current !== null) {
      window.clearTimeout(raiseTimer.current);
      raiseTimer.current = null;
    }
  };
  useEffect(() => cancelRaise, []);
  const top = minutesToPx(startMin) + 1;
  const height = Math.max(minutesToPx(endMin - startMin), 15) - 2; // min height 15px
  const isSmall = height <= 35;
  // Overlap cascade: indent right by a per-level % of the column (capped), and
  // raise z with the level so a later start sits on top. Hover lifts a buried card
  // to the front so it can be read/clicked. Transient (drag) cards keep z-50.
  // A completed task keeps its indent but drops back to the base z, so incomplete
  // tasks always stack above the done ones.
  const level = Math.min(indentLevel, MAX_LEVELS);
  const indentLeft = level > 0 ? `${level * INDENT_STEP_PCT}%` : undefined;
  const restingZ = isRaised ? Z_EVENT_HOVER : Z_EVENT_BASE + (isDone(todo) ? 0 : level);
  // Only show a time that's actually set - never fabricate the missing side. When both
  // sides share a meridiem, drop the AM/PM from the start so it reads "9:00 – 10:30 AM".
  // A one-sided task shows just that time (no dash, no fabricated duration).
  // A side counts only when it carries both a date and a time - the same rule
  // todoSpan places the card by, so the label can't claim an edge the span doesn't have.
  const hasStart = hasStartPoint(todo);
  const hasDue = hasDuePoint(todo);
  const startLabel = todo.startTime ? formatTime12h(todo.startTime) : '';
  const endLabel = todo.dueTime ? formatTime12h(todo.dueTime) : '';
  const bothTimes = hasStart && hasDue;
  // % 1440 keeps a legacy "24:00" (=1440) classified as AM, matching how
  // formatTime12h renders it - otherwise it reads as PM here and the start time
  // below loses its meridiem, turning 22:00-midnight into "10:00 – 12:00 AM".
  const meridiemPm = (t: string) => timeToMinutes(t) % 1440 >= 720;
  const sameMeridiem =
    bothTimes && meridiemPm(todo.startTime!) === meridiemPm(todo.dueTime!);
  // A span's segments each print only their own real edge - the midnight seam isn't
  // a time worth showing. A one-sided task's 30-minute block is only ever anchored on
  // one of its edges, so it says which edge that is rather than showing a bare time
  // the other half of which was invented.
  const timeRange = continuesAfter
    ? `starts ${startLabel}`
    : continuesBefore
      ? `ends ${endLabel}`
      : bothTimes
        ? `${sameMeridiem ? startLabel.replace(/\s*(AM|PM)$/i, '') : startLabel} - ${endLabel}`
        : hasStart
          ? `starts ${startLabel}`
          : hasDue
            ? `ends ${endLabel}`
            : startLabel || endLabel;
  // Duration is the WHOLE task's length, never this segment's slice.
  const isSegment = continuesBefore || continuesAfter;
  const durationStr =
    bothTimes || isSegment ? `(${formatDuration(durationMins ?? endMin - startMin)})` : '';
  const fullTimeDisplay = durationStr ? `${timeRange} ${durationStr}` : timeRange;

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => {
        setIsHovered(true);
        cancelRaise();
        raiseTimer.current = window.setTimeout(() => setIsRaised(true), HOVER_RAISE_DELAY_MS);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        cancelRaise();
        setIsRaised(false);
      }}
      className={`absolute left-1 right-1 rounded-md px-2 overflow-hidden cursor-pointer transition-opacity flex flex-col ${isSmall ? 'justify-center' : 'justify-start'
        } ${isDone(todo) ? 'opacity-40' : 'opacity-100'
        } ${continuesBefore ? 'rounded-t-none' : ''} ${continuesAfter ? 'rounded-b-none' : ''
        } ${isDragging ? 'z-50' : 'ring-1 ring-canvas'}
      `}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        // Cascade indent overrides the base left-1 (right-1 stays, so the card still
        // reaches the right edge and overlays the ones behind it). z follows the
        // level unless we're the drag ghost (which owns z-50 via the class above).
        ...(indentLeft ? { left: indentLeft } : {}),
        ...(isDragging ? {} : { zIndex: restingZ }),
        paddingTop: isSmall ? '0' : '5px',
        // The drag/resize ghost is outlined in the task's own accent.
        ...(isDragging ? { boxShadow: `0 0 0 1px ${accent}` } : {}),
        // paddingBottom: isSmall ? '0' : '3.5px',
        backgroundColor: isDone(todo)
          ? ((isHovered || isDragging) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)')
          : ((isHovered || isDragging)
            ? `color-mix(in srgb, ${accent} 50%, canvas 50%)`
            : `color-mix(in srgb, ${accent} 40%, canvas 60%)`),
        // border: isDone(todo)
        //   ? '1px solid rgba(255,255,255,0.05)'
        //   : '1px solid color-mix(in srgb, var(--accent1), transparent 70%)',
      }}
    >
      <div className={`flex gap-1.5 min-w-0 pl-1 ${isSmall ? 'w-full' : ''}`}>
        <div
          className="w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0 flex items-center justify-center relative"
          onClick={(e) => {
            if (onToggle) {
              e.stopPropagation();
              onToggle(e);
            }
          }}
          onMouseDown={(e) => {
            if (onToggle) e.stopPropagation();
          }}
        >
          {(isHovered && onToggle) ? (
            // The accent lives on the plain wrapper below, not on the motion.div:
            // handing motion a color via `style` makes it an animated value, and the
            // inherited "white" it starts from isn't interpolatable, so motion warns.
            <div className="absolute cursor-pointer flex items-center justify-center z-50" style={{ color: accent }}>
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 0.8, opacity: 1 }}
              >
                {isDone(todo) ? <CheckCircle2 size={15} strokeWidth={2.5} /> : <Circle size={15} strokeWidth={2.5} />}
              </motion.div>
            </div>
          ) : (
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDone(todo) ? 'bg-fill-stronger' : ''}`}
              style={isDone(todo) ? undefined : { backgroundColor: accent }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className={`text-[12px] font-semibold ${height < 50 ? 'truncate' : ''} ${isDone(todo) ? 'text-fg-ghost line-through' : 'text-fg'
            }`}>
            {todo.text || 'Untitled'}
          </span>
          {isSmall && (
            <span className={`text-[10px] truncate text-clip ${isDone(todo) ? 'text-fg-ghost' : ''}`}
              style={!isDone(todo) ? { color: `color-mix(in srgb, ${accent} 30%, var(--color-fg))` } : undefined}>
              {fullTimeDisplay}
            </span>
          )}
        </div>
      </div>
      {!isSmall && (
        <div className={`text-[10px] pl-4 ${height < 50 ? 'truncate' : ''} ${isDone(todo) ? 'text-fg-ghost' : ''
          }`}
          style={!isDone(todo) ? { color: `color-mix(in srgb, ${accent} 30%, var(--color-fg))` } : undefined}>
          {fullTimeDisplay}
        </div>
      )}
      {!isDone(todo) && (
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />
      )}
      {/* Resize handles */}
      {!isDone(todo) && onResizeStart && (
        <>
          {!continuesBefore && (
            <div
              className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize z-20 border-transparent"
              onMouseDown={(e) => onResizeStart(e, 'top')}
            />
          )}
          {!continuesAfter && (
            <div
              className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize z-20 border-transparent"
              onMouseDown={(e) => onResizeStart(e, 'bottom')}
            />
          )}
        </>
      )}
    </div>
  );
};

// ─── Main CalendarView ──────────────────────────────────────────────────────

export const CalendarView: React.FC<CalendarViewProps> = ({
  dayTodos,
  onSaveTodo,
  onToggleTodo,
  initialDate,
  initialDays,
  hideHeader,
  hideMiniCalendar,
  onFocusDateChange,
  onCreateTask,
  surfacesGovernCreate = true,
  onOpenTask,
}) => {
  const [focusDate, setFocusDate] = useState(initialDate ? parseISO(initialDate) : new Date());
  const [miniCalMonth, setMiniCalMonth] = useState(initialDate ? parseISO(initialDate) : new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);

  // The calendar sidebar filter, persisted to user_settings (surfaces + collections).
  // Surfaces default on; collections are stored as an exclusion list so anything not
  // explicitly unchecked - including newly created collections - is on by default.
  // Writes are debounced/optimistic via the settings pipeline.
  const [filter, patchFilter] = useSyncedCalendarFilter();
  const showDaily = filter.showDaily ?? true;
  const showPlanner = filter.showPlanner ?? true;
  const showUncategorized = filter.showUncategorized ?? true;
  // Archived tasks (and their collections) are hidden unless this is turned on.
  const showArchived = filter.showArchived ?? false;
  const setShowDaily = useCallback((v: boolean) => patchFilter(() => ({ showDaily: v })), [patchFilter]);
  const setShowPlanner = useCallback((v: boolean) => patchFilter(() => ({ showPlanner: v })), [patchFilter]);
  const setShowUncategorized = useCallback((v: boolean) => patchFilter(() => ({ showUncategorized: v })), [patchFilter]);
  const setShowArchived = useCallback((v: boolean) => patchFilter(() => ({ showArchived: v })), [patchFilter]);

  // The collection tree shows archived collections only when "show archived" is on.
  const coll = useCollectionTree(dayTodos, showArchived);

  // Days shown in the grid. `initialDays` (embedded contexts, e.g. the daily page) is a
  // fixed override and isn't persisted; the main calendar reads/writes the saved value.
  const dayCount = initialDays ?? filter.dayCount ?? 3;
  const setDayCount = useCallback((n: number) => patchFilter(() => ({ dayCount: n })), [patchFilter]);

  // Collections are persisted as an *exclusion* list: an id is checked unless it's in
  // `uncheckedCollections`. That way a collection created after the filter was last
  // customized is on by default, instead of being absent from a stale allowlist.
  const uncheckedColls = useMemo(
    () => new Set(filter.uncheckedCollections ?? []),
    [filter.uncheckedCollections]
  );
  const checkedColls = useMemo(
    () => new Set(coll.allCollectionIds.filter((id) => !uncheckedColls.has(id))),
    [coll.allCollectionIds, uncheckedColls]
  );
  // Mutations edit the exclusion set, so ids we can't currently see (e.g. archived
  // collections while "show archived" is off) keep their state instead of being wiped.
  const patchUnchecked = useCallback(
    (fn: (next: Set<string>) => void) => {
      const next = new Set(uncheckedColls);
      fn(next);
      patchFilter(() => ({ uncheckedCollections: [...next] }));
    },
    [uncheckedColls, patchFilter]
  );

  const toggleChecked = useCallback(
    (id: string) => {
      patchUnchecked((next) => {
        next.has(id) ? next.delete(id) : next.add(id);
      });
    },
    [patchUnchecked]
  );

  // Select-all / deselect-all for the collection tree header (over the visible ids).
  const allCollsChecked =
    coll.allCollectionIds.length > 0 && coll.allCollectionIds.every((id) => checkedColls.has(id));
  const toggleAllColls = useCallback(() => {
    patchUnchecked((next) => {
      for (const id of coll.allCollectionIds) allCollsChecked ? next.add(id) : next.delete(id);
    });
  }, [allCollsChecked, coll.allCollectionIds, patchUnchecked]);

  // Apply a checked state to all descendant collections (the subtree prompt's action).
  const applyDescendantColls = useCallback(
    (id: string, checked: boolean) => {
      patchUnchecked((next) => {
        for (const cid of coll.descendantCollIds(id)) checked ? next.delete(cid) : next.add(cid);
      });
    },
    [coll.descendantCollIds, patchUnchecked]
  );

  // Sync focus date when the URL's ?date changes (deep link / back-forward). Guard
  // against the write-back round-trip: skip when it already matches focusDate, so our
  // own onFocusDateChange navigations don't clobber miniCalMonth or re-fire.
  useEffect(() => {
    if (!initialDate) return;
    const parsed = parseISO(initialDate);
    if (format(parsed, 'yyyy-MM-dd') === format(focusDate, 'yyyy-MM-dd')) return;
    setFocusDate(parsed);
    setMiniCalMonth(parsed);
  }, [initialDate]);

  // Drag Selection State
  const [dragSelection, setDragSelection] = useState<{
    dateStr: string;
    startMins: number;
    endMins: number;
    startY: number;
  } | null>(null);

  // Moving/Resizing State. Both track the task as an absolute span rather than
  // per-day minutes plus a pinned column, so an edge can cross midnight by plain
  // arithmetic and the ghost can be re-segmented into whichever columns it covers.
  const [draggingEvent, setDraggingEvent] = useState<{
    todo: Todo;
    // Null when the drag started from the all-day row: an untimed task has no span to
    // move. One is synthesised from the pointer if and when it enters the grid.
    origSpan: TodoSpan | null;
    curSpan: TodoSpan | null;
    grabAbsMins: number;   // absolute minute under the cursor when the drag began
    grabDateStr: string;   // column grabbed in (to measure horizontal column delta)
    startX: number;        // where drag started (to calculate col offset)
    startY: number;        // where drag started Y
    // Which band the pointer is currently over. One drag can cross between them, so
    // the zone - not where the drag began - decides what the ghost looks like and
    // what the drop writes.
    zone: 'grid' | 'allday';
    allDayDate: string | null; // the column under the pointer, while zone is 'allday'
  } | null>(null);

  const [resizingEvent, setResizingEvent] = useState<{
    todo: Todo;
    edge: 'top' | 'bottom';
    origSpan: TodoSpan;
    curSpan: TodoSpan;
    grabAbsMins: number;   // absolute minute under the cursor when the resize began
    grabDateStr: string;   // column the handle was grabbed in
  } | null>(null);

  // Post-drop "settling" ghost. commitSpan writes the new time through react-query's
  // optimistic cache, but the echo back into our `dayTodos` prop lands a tick later
  // (the parent re-renders on the query notification, a microtask after the drop). If
  // we simply cleared the drag state on drop, the original card would un-hide at its
  // OLD position for that one frame before the prop catches up - the "flash back, then
  // flash forward". So we keep drawing the card at its dropped spot (and keep the
  // original hidden) until the prop reports the committed time, then release. Same
  // preview-until-echo trick TimeInput uses for its rails.
  //
  // `placement` is where to draw the ghost, which is not always a span: a task
  // dropped on the all-day row has no time to draw at, only a column.
  const [settling, setSettling] = useState<{
    id: string;
    accent: string;
    placement: SettlePlacement;
    // The bucket we committed into (the NEW dueDate, or UNDATED when we cleared it),
    // which is where the echo lands.
    bucket: string;
    // The exact schedule we committed; the ghost lifts once the prop echoes it back.
    // All four keys, not just the times, so "cleared" is as expressible as "set" -
    // matching on undefined works because the optimistic cache merge keeps an
    // explicit undefined (see useUpdateTodo in features/tasks/api/todos.ts).
    expect: SchedulePatch;
  } | null>(null);

  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);

  // A task wears its collection's color so the calendar reads like the Planner. Any
  // task without a collection - whether daily-only or an uncategorized planner task -
  // is grey.
  const accentForTodo = useCallback(
    (todo: Todo): string => {
      const collId = collectionOf(todo, byId);
      if (!collId) return 'var(--color-collection-1)';
      return collectionColor(byId.get(collId)?.color);
    },
    [byId]
  );

  // Persist a task's new schedule and hold the settling ghost over the gap.
  //
  // Buckets are keyed by dueDate, and a 2-day task renders in a column that is NOT
  // its dueDate - so a cross-day drag changes which bucket the task belongs to.
  // That used to be written as "re-save the old day without it, then re-save the new
  // day with it": two requests, the first of which DELETED the task (the day array
  // was authoritative), so a lost race between them destroyed it outright. It's one
  // row and one write now - dueDate is the only thing that decides the bucket.
  //
  // `expect` is taken from the patch as written, BEFORE the save path runs it through
  // reconcileSchedule (see writeHubTodo). That's sound for the shapes produced here -
  // a grid drop sets both sides complete, an all-day drop clears both times - neither
  // of which reconcileSchedule alters. A future patch shape that it DOES rewrite would
  // never echo back what we recorded, and the ghost would hang until the 600ms net.
  const commitSchedule = useCallback((todo: Todo, patch: SchedulePatch, placement: SettlePlacement) => {
    // One write either way. A cross-day drag is just a save whose dueDate differs;
    // onSaveTodo notices that itself and lands the task at the bottom of the day it
    // moved to, so there's no branch here (and no second handler) to keep in step.
    onSaveTodo({ ...todo, ...patch } as Todo);

    setSettling({
      id: todo.id,
      accent: accentForTodo(todo),
      placement,
      // Clearing the dueDate drops the task into the undated bucket, which is where
      // its echo will land.
      bucket: patch.dueDate ?? UNDATED,
      expect: patch,
    });
  }, [onSaveTodo, accentForTodo]);

  // A move or resize on the time grid: the span decides all four schedule fields.
  const commitSpan = useCallback((todo: Todo, span: TodoSpan) => {
    commitSchedule(todo, decomposeSpan(span), { kind: 'grid', span });
  }, [commitSchedule]);

  // const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dayPickerRef = useRef<HTMLDivElement>(null);
  // The all-day row, and its day-columns strip (gutter excluded). Both are measured
  // during a drag: the row decides which zone the pointer is in, the strip is the
  // measuring rod for which column it's over.
  const allDayRowRef = useRef<HTMLDivElement>(null);
  const allDayStripRef = useRef<HTMLDivElement>(null);

  // Visible days array
  const visibleDays = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(focusDate, i));
  }, [focusDate, dayCount]);

  // The columns, as the all-day row wants them (it has no need for Date objects).
  const allDayColumns = useMemo(
    () => visibleDays.map((d) => ({ key: d.toISOString(), dateStr: format(d, 'yyyy-MM-dd') })),
    [visibleDays]
  );

  // Auto-scroll to ~7 AM on mount and when focus changes
  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, [focusDate]);

  // Close day picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dayPickerRef.current && !dayPickerRef.current.contains(e.target as Node)) {
        setShowDayPicker(false);
      }
    };
    if (showDayPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDayPicker]);

  // Current time indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Move the focused day and reflect it into the URL (?date) so the calendar is
  // deep-linkable and back/forward works. miniCalMonth is handled per-caller to
  // preserve the prior behavior (shiftDays leaves the mini-calendar month alone).
  const commitFocusDate = (dt: Date) => {
    setFocusDate(dt);
    onFocusDateChange?.(format(dt, 'yyyy-MM-dd'));
  };

  // Navigate
  const shiftDays = (dir: number) => {
    commitFocusDate(addDays(focusDate, dir * dayCount));
  };

  const goToday = () => {
    commitFocusDate(new Date());
    setMiniCalMonth(new Date());
  };

  const handleMiniCalDateClick = (d: Date) => {
    commitFocusDate(d);
    setMiniCalMonth(d);
  };

  // The collection filter, applied AFTER the surface toggles decide the base set: a
  // task with no collection shows only when "Show uncategorized" is on; a task with a
  // collection shows only when one of its collection ancestors is checked (a checked
  // parent pulls in its whole subtree).
  const passesCollectionFilter = useCallback(
    (t: Todo): boolean => {
      if (collectionOf(t, byId) === null) return showUncategorized;
      for (const id of taskCollectionAncestors(t, byId)) if (checkedColls.has(id)) return true;
      return false;
    },
    [showUncategorized, checkedColls, byId]
  );

  // The filters that decide whether a task is on this calendar AT ALL, independent of
  // where it gets drawn. Shared by the time grid and the all-day row so the two can
  // never disagree about what's visible: unchecking a collection has to empty both.
  const passesGates = useCallback(
    (t: Todo): boolean => {
      // Archived tasks are hidden entirely unless "show archived" is on; this gate
      // owns the archived exclusion, so the planner surface below uses raw
      // showInDatabase (equivalent to showsInOrganizer for non-archived tasks).
      if (t.archived && !showArchived) return false;
      // Stage 1 - base set: the union of the enabled surfaces (both off ⇒ nothing).
      const inSet =
        (showDaily && t.showInDailyList === true) || (showPlanner && t.showInDatabase === true);
      // Stage 2 - the uncategorized/collection filters narrow that base set.
      return inSet && passesCollectionFilter(t);
    },
    [showArchived, showDaily, showPlanner, passesCollectionFilter]
  );

  // Every renderable task, expanded into each day column its span touches.
  //
  // A task used to be read straight out of the dueDate bucket matching the column,
  // which is exactly why one starting the previous day drew as a single short block
  // on its due day. The SPAN picks the columns now: a 2-day task is emitted into
  // both. Anything longer is dropped entirely - the all-day header bar those want
  // isn't built yet.
  //
  // The span is resolved BEFORE the surface filters, because it is what decides
  // whether a task is placeable at all. The Daily surface then reads the raw
  // showInDailyList flag rather than showsOnDailyChecklist: that helper keys on
  // dueDate because the daily CHECKLIST is dueDate-driven, but the calendar places a
  // task by its span - so a start-only task (no dueDate) still belongs under the
  // Daily surface when it carries the flag. Filtering per column would also hide a
  // span's first day, since its dueDate only matches the second.
  const todosByDate = useMemo(() => {
    const map = new Map<string, { todo: Todo; span: TodoSpan }[]>();
    for (const day of dayTodos) {
      for (const t of day.todos || []) {
        // A task needs at least one time to be placeable at all; todoSpan applies the
        // real rule (a side counts only with a date AND a time). The 30-minute default
        // for a one-sided task is applied at render (kept off the todo) so the event
        // card can tell which side was never set and label it "starts"/"ends".
        // An untimed task isn't dropped any more - it goes to the all-day row below.
        if (!t || !(t.startTime || t.dueTime)) continue;

        const span = todoSpan(t);
        // A null span means there's no real date to place the task on. Over 24h is a
        // multi-day task, which still isn't drawn: the all-day row below takes UNTIMED
        // tasks only, and rendering a timed span as a bar across columns is its own
        // job (it would need the row to lay out spanning bars, not a stack of chips).
        if (!span || !isRenderableSpan(span)) continue;

        if (!passesGates(t)) continue;

        const firstIdx = Math.floor(span.absStart / MINS_PER_DAY);
        const lastIdx = Math.floor(span.absEnd / MINS_PER_DAY);
        for (let i = firstIdx; i <= lastIdx; i++) {
          const key = dateStrFromIndex(i);
          const arr = map.get(key);
          if (arr) arr.push({ todo: t, span });
          else map.set(key, [{ todo: t, span }]);
        }
      }
    }
    return map;
  }, [dayTodos, passesGates]);

  const getTodosForDate = useCallback(
    (dateStr: string) => todosByDate.get(dateStr) ?? [],
    [todosByDate]
  );

  // The all-day row's contents: dated tasks with no time on either side, keyed by the
  // column they belong to. Disjoint from todosByDate by construction - that map needs
  // a time, this one needs the absence of one - so nothing is drawn twice.
  //
  // Note this reads EVERY bucket, including the undated one: a task with only a
  // startDate lives there, and its start date is still a column it can be shown in.
  const allDayByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const day of dayTodos) {
      for (const t of day.todos || []) {
        if (!t || !isUntimedDated(t) || !passesGates(t)) continue;
        const key = allDayDateOf(t)!;
        const arr = map.get(key);
        if (arr) arr.push(t);
        else map.set(key, [t]);
      }
    }
    for (const arr of map.values()) arr.sort(compareAllDay);
    return map;
  }, [dayTodos, passesGates]);

  // What each column of the row actually draws, ghost included.
  //
  // The ghost is a task on its way INTO the row - dragged out of the grid, or already
  // committed and waiting for the echo. In the settling case the optimistic cache can
  // report the task as untimed before the ghost lifts, which would draw it twice, so
  // the in-flight task is filtered out of the real list either way and the ghost is
  // the single copy on screen.
  const allDayColumnItems = useMemo(() => {
    const ghost: { todo: Todo; dateStr: string } | null =
      draggingEvent?.zone === 'allday' && draggingEvent.allDayDate
        ? { todo: draggingEvent.todo, dateStr: draggingEvent.allDayDate }
        : settling?.placement.kind === 'allday'
          ? (() => {
              const t = byId.get(settling.id);
              return t ? { todo: t, dateStr: settling.placement.dateStr } : null;
            })()
          : null;
    const inFlightId = draggingEvent?.todo.id ?? settling?.id ?? null;

    const map = new Map<string, AllDayItem[]>();
    for (const { dateStr } of allDayColumns) {
      const column = allDayByDate.get(dateStr) ?? [];
      const items: AllDayItem[] = column
        .filter(t => t.id !== inFlightId)
        .map(todo => ({ todo, isGhost: false }));
      if (ghost && ghost.dateStr === dateStr) {
        // A chip dragged around inside its own column keeps its slot, because a
        // same-column drop doesn't move it (the day is unchanged, so the save keeps
        // its dailyOrder). Coming from anywhere else it goes to the end, which is
        // where a task landing in a new day is placed.
        const wasAt = column.findIndex(t => t.id === ghost.todo.id);
        const at = wasAt === -1 ? items.length : wasAt;
        items.splice(at, 0, { todo: ghost.todo, isGhost: true });
      }
      map.set(dateStr, items);
    }
    return map;
  }, [allDayColumns, allDayByDate, draggingEvent, settling, byId]);

  // The row is as tall as the busiest VISIBLE day - a day off-screen doesn't stretch
  // it - and never shorter than one slot, so it stays a drop target when empty. The
  // ghost counts, so the row opens a slot for an incoming task instead of clipping it.
  const allDayHeight = useMemo(
    () =>
      allDayRowHeight(
        allDayColumns.reduce((max, { dateStr }) => Math.max(max, allDayColumnItems.get(dateStr)?.length ?? 0), 0)
      ),
    [allDayColumns, allDayColumnItems]
  );

  // --- Drag Selection for Creation --- //
  // A drawn task takes the surfaces this calendar is showing, so with both turned
  // off there is nothing to give it: it would be written to a surface the user has
  // switched off and disappear the moment it was created (or, worse, be rescued
  // onto one they didn't pick). Nothing to draw with, so drawing is off - but only
  // where those toggles are what creation reads (see surfacesGovernCreate).
  const canDrawTasks = !surfacesGovernCreate || showDaily || showPlanner;

  const handleGridMouseDown = (e: React.MouseEvent, dateStr: string) => {
    // Ignore right/middle clicks or if clicking on an event
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-event-card]')) return;
    if (!canDrawTasks) return;

    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;

    // Snap to 15 mins (0, 15, 30, 45)
    const rawMins = (y / HOUR_HEIGHT) * 60;
    const snappedMins = Math.floor(rawMins / 15) * 15;

    setDragSelection({
      dateStr,
      startMins: snappedMins,
      endMins: snappedMins + 15, // initial duration 15m
      startY: e.clientY,
    });
  };

  useEffect(() => {
    if (!dragSelection) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the grid offset to calculate new Y relative to the column
      if (!scrollContainerRef.current) return;

      const deltaY = e.clientY - dragSelection.startY;
      let newEndMins = dragSelection.startMins + 15 + Math.round((deltaY / HOUR_HEIGHT) * 60);
      newEndMins = Math.max(dragSelection.startMins + 15, Math.ceil(newEndMins / 15) * 15);
      newEndMins = Math.min(newEndMins, 1440); // cap at 24:00

      setDragSelection(prev => prev ? { ...prev, endMins: newEndMins } : null);
    };

    const handleMouseUp = () => {
      if (!dragSelection) return;

      // Calculate start and end HH:MM (end-of-day clamps to 23:59, not "24:00")
      const startTime = minutesToTime(dragSelection.startMins);
      const dueTime = minutesToTime(dragSelection.endMins);

      // The drawn block *is* the task - create it with those times and the surfaces
      // this calendar is showing, then hand the user straight to the full view to
      // name it and fill in the rest.
      const id = onCreateTask(dragSelection.dateStr, startTime, dueTime, {
        daily: showDaily,
        planner: showPlanner,
      });
      onOpenTask(id);
      setDragSelection(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragSelection, onCreateTask, onOpenTask, showDaily, showPlanner]);

  // --- Drag & Drop Moving --- //
  const handleEventMouseDown = (e: React.MouseEvent, todo: Todo, span: TodoSpan, dateStr: string) => {
    // Left click only
    if (e.button !== 0) return;
    e.stopPropagation(); // prevent drag selection
    if (!scrollContainerRef.current) return;

    // Anchor the drag on the absolute minute under the cursor, not the card's top:
    // grabbing either segment of a span then moves the whole task by the same
    // pointer delta, with no need to know which half was grabbed.
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;
    const grabAbsMins = dayIndex(dateStr) * MINS_PER_DAY + (relativeY / HOUR_HEIGHT) * 60;

    setSettling(null); // a fresh grab supersedes any in-flight settle
    setDraggingEvent({
      todo,
      origSpan: span,
      curSpan: span,
      grabAbsMins,
      grabDateStr: dateStr,
      startX: e.clientX,
      startY: e.clientY,
      zone: 'grid',
      allDayDate: null,
    });
  };

  // Grabbing an all-day chip. Mirrors handleEventMouseDown, minus the span: there are
  // no times to anchor on, so the drag starts spanless and in the all-day zone. Moving
  // within the row only re-columns it; the span appears the moment it enters the grid.
  const handleChipMouseDown = (e: React.MouseEvent, todo: Todo, dateStr: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    setSettling(null); // a fresh grab supersedes any in-flight settle
    setDraggingEvent({
      todo,
      origSpan: null,
      curSpan: null,
      grabAbsMins: 0, // unused: there's no grab offset to preserve without a span
      grabDateStr: dateStr,
      startX: e.clientX,
      startY: e.clientY,
      zone: 'allday',
      allDayDate: dateStr,
    });
  };

  // Which day column a pointer x sits over, measured off the all-day row's strip -
  // the day columns only, gutter excluded. The grid's columns are the same width and
  // start at the same x (both sit right of the 64px gutter inside the same parent),
  // so this is the measuring rod for both bands.
  const columnIndexAtX = useCallback((clientX: number): number => {
    const strip = allDayStripRef.current?.getBoundingClientRect();
    const n = visibleDays.length;
    if (!strip || n === 0 || strip.width === 0) return 0;
    const idx = Math.floor((clientX - strip.left) / (strip.width / n));
    return Math.max(0, Math.min(idx, n - 1));
  }, [visibleDays.length]);

  // Is the pointer over the all-day row's droppable area? Measured from the live
  // rects rather than a stored y-threshold, because the row's height changes DURING a
  // drag (it grows a slot for the incoming ghost). The gutter is excluded, so a
  // release over the "all-day" label reads as a grid drop rather than silently
  // stripping the task's times.
  const isOverAllDay = useCallback((clientX: number, clientY: number): boolean => {
    const row = allDayRowRef.current?.getBoundingClientRect();
    const strip = allDayStripRef.current?.getBoundingClientRect();
    if (!row || !strip) return false;
    return clientY >= row.top && clientY <= row.bottom && clientX >= strip.left && clientX <= strip.right;
  }, []);

  useEffect(() => {
    if (!draggingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;

      const deltaY = Math.abs(e.clientY - draggingEvent.startY);
      const deltaX = Math.abs(e.clientX - draggingEvent.startX);
      if (deltaY < 3 && deltaX < 3) return; // ignore minimal twitch

      // Over the all-day row: the task is heading for "this day, no time". There's no
      // vertical position to track - only which column - so the span is left as it is
      // and simply ignored unless the pointer comes back down to the grid.
      if (isOverAllDay(e.clientX, e.clientY)) {
        const dateStr = format(visibleDays[columnIndexAtX(e.clientX)], 'yyyy-MM-dd');
        setDraggingEvent(prev =>
          prev && prev.zone === 'allday' && prev.allDayDate === dateStr
            ? prev
            : prev && { ...prev, zone: 'allday', allDayDate: dateStr }
        );
        return;
      }

      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;

      // The column the pointer is actually over. This used to be the grab column plus
      // a rounded delta of pointer travel divided by a column width taken from the
      // scroll container - gutter included - so every column was over-measured by
      // gutter/n px and a long horizontal drag drifted by a column.
      const colIndex = columnIndexAtX(e.clientX);
      const colDateStr = format(visibleDays[colIndex], 'yyyy-MM-dd');

      // Whole-task move = pointer delta on the absolute timeline, snapped to 15min.
      const pointerAbs = dayIndex(colDateStr) * MINS_PER_DAY + (relativeY / HOUR_HEIGHT) * 60;
      const delta = Math.round((pointerAbs - draggingEvent.grabAbsMins) / 15) * 15;

      // A task dragged out of the all-day row has no span to shift, so one is built
      // from the pointer each move: the block's TOP sits at the cursor (there's no
      // grab offset to preserve), snapped to 15 minutes and kept inside the day.
      const spanFromPointer = (): TodoSpan => {
        const minsInDay = Math.min(
          Math.max(Math.round(((relativeY / HOUR_HEIGHT) * 60) / 15) * 15, 0),
          MINS_PER_DAY - ALL_DAY_DROP_DURATION_MINS
        );
        const absStart = dayIndex(colDateStr) * MINS_PER_DAY + minsInDay;
        return normalizeSpanEnd({ absStart, absEnd: absStart + ALL_DAY_DROP_DURATION_MINS });
      };

      setDraggingEvent(prev =>
        prev
          ? {
              ...prev,
              zone: 'grid',
              allDayDate: null,
              curSpan: prev.origSpan ? shiftSpan(prev.origSpan, delta) : spanFromPointer(),
            }
          : null
      );
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!draggingEvent) return;

      const dist = Math.abs(e.clientX - draggingEvent.startX) + Math.abs(e.clientY - draggingEvent.startY);
      if (dist < 5) {
        // It's a click, not a drag - open the task in the full view.
        onOpenTask(draggingEvent.todo.id);
        setDraggingEvent(null);
        return;
      }

      // Dropped on the all-day row: keep the day, lose the clock. startDate goes with
      // the times, so a task that spanned two days collapses onto the column it was
      // dropped on rather than staying a range with no hours - one untimed task, one
      // day, which is all this row can express.
      if (draggingEvent.zone === 'allday' && draggingEvent.allDayDate) {
        commitSchedule(
          draggingEvent.todo,
          { startDate: undefined, startTime: undefined, dueDate: draggingEvent.allDayDate, dueTime: undefined },
          { kind: 'allday', dateStr: draggingEvent.allDayDate }
        );
        setDraggingEvent(null);
        return;
      }

      // commitSpan owns the write, including routing the task into its NEW dueDate
      // bucket, and keeps the card painted at its dropped spot until the prop echoes
      // back (see `settling`) so it doesn't flash to the old position first.
      //
      // No span means the drag never reached the grid (it began on a chip and was
      // released outside both bands) - nothing to write.
      if (draggingEvent.curSpan) commitSpan(draggingEvent.todo, draggingEvent.curSpan);
      setDraggingEvent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEvent, dayTodos, commitSpan, commitSchedule, visibleDays, onOpenTask, columnIndexAtX, isOverAllDay]);

  // --- Drag Resizing --- //
  const handleEventResizeStart = (
    e: React.MouseEvent,
    todo: Todo,
    span: TodoSpan,
    dateStr: string,
    edge: 'top' | 'bottom',
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!scrollContainerRef.current) return;

    // Anchor on the pointer's ABSOLUTE grid position, exactly like the move handler.
    // This used to be a viewport-space delta (clientY - startY), which silently
    // desyncs by however much the grid scrolls mid-drag - and reaching the small
    // hours means dragging to the very top of the grid, precisely where that
    // overshoot pushes the edge past midnight and onto the wrong day.
    const containerRect = scrollContainerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;
    const grabAbsMins = dayIndex(dateStr) * MINS_PER_DAY + (relativeY / HOUR_HEIGHT) * 60;

    setSettling(null); // a fresh resize supersedes any in-flight settle
    setResizingEvent({
      todo,
      edge,
      origSpan: span,
      curSpan: span,
      grabAbsMins,
      grabDateStr: dateStr,
    });
  };

  useEffect(() => {
    if (!resizingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;

      // Scroll-proof: derive the pointer's absolute minute the same way the move
      // handler does, then take the delta from where the handle was grabbed. A
      // pointer above/below the column simply reads past that day's bounds, which is
      // what lets an edge cross midnight into the neighbouring day.
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;
      const pointerAbs =
        dayIndex(resizingEvent.grabDateStr) * MINS_PER_DAY + (relativeY / HOUR_HEIGHT) * 60;
      const deltaMins = Math.round((pointerAbs - resizingEvent.grabAbsMins) / 15) * 15;

      // Only the dragged edge moves (see resizeSpan), so a resize writes back just
      // that one side - and working in absolute minutes lets the edge cross midnight,
      // turning a same-day task into a 2-day span and back.
      setResizingEvent(prev =>
        prev ? { ...prev, curSpan: resizeSpan(prev.origSpan, prev.edge, deltaMins) } : null
      );
    };

    const handleMouseUp = () => {
      if (!resizingEvent) return;
      commitSpan(resizingEvent.todo, resizingEvent.curSpan);
      setResizingEvent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingEvent, dayTodos, commitSpan]);

  // Release the settling ghost once the prop reports the time we committed. Until
  // then the ghost covers the gap where the un-hidden original would show its old
  // position. applyTodoBatch always yields a fresh dayTodos, so this re-runs on the
  // echo even for a no-op drop.
  useEffect(() => {
    if (!settling) return;
    // The echo lands in the bucket we wrote into - the task's NEW dueDate.
    const day = dayTodos.find(d => d.date === settling.bucket);
    const t = day?.todos.find(x => x?.id === settling.id);
    // All four fields, so a cleared time (undefined === undefined) releases the ghost
    // exactly as a set one does.
    if (t && SCHEDULE_KEYS.every(k => t[k] === settling.expect[k])) {
      setSettling(null);
    }
  }, [dayTodos, settling]);

  // Safety net: never let a ghost wedge if the echo somehow never matches (e.g. a
  // rejected mutation rolls the cache back). The real echo lands within a tick, well
  // inside this window, so it clears via the effect above first in the normal path.
  useEffect(() => {
    if (!settling) return;
    const id = window.setTimeout(() => setSettling(null), 600);
    return () => window.clearTimeout(id);
  }, [settling]);

  return (
    <div className={`flex ${hideHeader ? 'h-full' : 'h-screen'} mx-auto w-full`}>
      {/* Left side: Mini calendar */}
      {!hideMiniCalendar && (
        <div className="w-60 flex-shrink-0 pt-2 hidden lg:flex lg:flex-col min-h-0 border-r border-line mr-4 bg-surface">
          {/* Calendar is h-full; without a content-height wrapper it eats the whole
              screen-height column and pushes the toggles below the fold. */}
          <div className="shrink-0 px-3">
            <Calendar
              currentMonth={miniCalMonth}
              onMonthChange={setMiniCalMonth}
              onDateClick={handleMiniCalDateClick}
              focusDate={focusDate}
            />
          </div>

          {/* Which surfaces' tasks get blocked out on the grid. Sits flush under the mini
              calendar; row rhythm (space-y-0.5) matches the collection rows below. */}
          <div className="shrink-0 my-2 mx-3 border-t border-line"></div>
          <div className="shrink-0 px-4">
            <SurfaceCheck label="Show daily tasks" checked={showDaily} onChange={setShowDaily} />
            <SurfaceCheck label="Show task planner tasks" checked={showPlanner} onChange={setShowPlanner} />
            <SurfaceCheck label="Show uncategorized tasks" checked={showUncategorized} onChange={setShowUncategorized} />
            <SurfaceCheck label="Show archived tasks" checked={showArchived} onChange={setShowArchived} />
            {/* Drawing is off with both surfaces unchecked (see canDrawTasks), which
                is otherwise indistinguishable from the grid ignoring the drag. The
                app has no toast layer, so the explanation lives next to the two
                checkboxes that caused it. */}
            {!canDrawTasks && (
              <p className="mt-1.5 text-xs text-fg-subtle">
                Turn on a surface to draw new tasks here.
              </p>
            )}
          </div>

          {/* Pick which collections' tasks appear. The tree renders in checkbox mode;
              nothing shows until a collection is checked. */}
          <div className="shrink-0 my-2 mx-3 border-t border-line"></div>
          <CollectionTree
            visibleCollections={coll.visibleCollections}
            collectionCount={coll.collectionCount}
            collapsedColls={coll.collapsedColls}
            toggleCollColl={coll.toggleCollColl}
            checkedColls={checkedColls}
            onToggleChecked={toggleChecked}
            allChecked={allCollsChecked}
            onToggleAll={toggleAllColls}
            onToggleSubtree={applyDescendantColls}
          />
        </div>
      )}

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {!hideHeader && (
          <div className="flex items-center justify-between px-2 py-3 flex-shrink-0">
            <h2 className="text-xl font-bold text-fg">
              {format(focusDate, 'MMMM yyyy')}
            </h2>

            <div className="flex items-center gap-2">
              {/* Day count picker */}
              <div className="relative" ref={dayPickerRef}>
                <button
                  onClick={() => setShowDayPicker(!showDayPicker)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${btnNeutral}`}
                >
                  {dayCount} day{dayCount > 1 ? 's' : ''}
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showDayPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full mt-1 right-0 bg-surface border border-line rounded-xl shadow-2xl py-1 z-50 min-w-[80px]"
                    >
                      {DAY_OPTIONS.map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            setDayCount(n);
                            setShowDayPicker(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${dayCount === n
                            ? 'text-[var(--accent2)] bg-[var(--accent2)]/10'
                            : 'text-fg-subtle hover:text-fg hover:bg-fill-subtle'
                            }`}
                        >
                          {n} day{n > 1 ? 's' : ''}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Today button */}
              <button
                onClick={goToday}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${btnNeutral}`}
              >
                Today
              </button>

              {/* Nav arrows */}
              <button
                onClick={() => shiftDays(-1)}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => shiftDays(1)}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="flex flex-shrink-0 border-b border-line-subtle">
          {/* Gutter for time labels */}
          <div className="flex-shrink-0" style={{ width: GUTTER_WIDTH }} />
          {visibleDays.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className="flex-1 text-center pb-3 border-l border-line-subtle"
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-sm font-bold ${today ? 'text-accent2' : 'text-fg-ghost'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-bold px-1.25 py-0.75 rounded-md transition-all ${today
                    ? 'bg-accent2 text-canvas'
                    : 'text-fg-muted'
                    }`}>
                    {format(day, 'd')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day row: dated tasks with no time. A flex sibling of the header row and
            the scroller, so it's pinned under the dates without any sticky handling. */}
        <AllDayRow
          rowRef={allDayRowRef}
          stripRef={allDayStripRef}
          days={allDayColumns}
          itemsByDate={allDayColumnItems}
          height={allDayHeight}
          gutterWidth={GUTTER_WIDTH}
          accentFor={accentForTodo}
          onToggleTodo={onToggleTodo}
          onChipMouseDown={handleChipMouseDown}
        />

        {/* Scrollable time grid */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden calendar-scroll select-none"
        >
          <div className="flex relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
            {/* Time labels gutter */}
            <div className="flex-shrink-0 relative" style={{ width: GUTTER_WIDTH }}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] font-mono text-fg-ghost -translate-y-1/2"
                  style={{ top: `${h * HOUR_HEIGHT}px` }}
                >
                  {h === 0 ? '' : formatHour(h)}
                </div>
              ))}
            </div>

            {/* Current time indicator line (global) */}
            {visibleDays.some(d => isToday(d)) && (
              <div
                className="absolute left-0 right-0 z-30 pointer-events-none"
                style={{ top: `${minutesToPx(nowMinutes)}px` }}
              >
                {/* Global Thin Line - starts at the gutter edge so it spans the full day grid */}
                <div className="absolute right-0 h-[1px] bg-danger opacity-30" style={{ left: GUTTER_WIDTH }} />

                {/* Badge Container */}
                <div className="absolute left-0 h-[1px]" style={{ width: GUTTER_WIDTH }}>
                  <div className="absolute right-[2px] px-1.5 py-[3px] bg-danger rounded text-[10px] font-mono font-bold text-white leading-none z-10 -translate-y-1/2 whitespace-nowrap">
                    {format(now, 'h:mm a').toUpperCase()}
                  </div>
                  {/* Connector linking badge to global line */}
                  <div className="absolute right-0 w-[2px] h-[1px] bg-danger" />
                </div>
              </div>
            )}

            {/* Day columns */}
            {visibleDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              // Each entry's slice of THIS column - a 2-day task appears in both,
              // as its tail on the first day and its head on the second.
              const segments = getTodosForDate(dateStr).flatMap(({ todo, span }) => {
                const seg = segmentFor(span, dateStr);
                return seg ? [{ todo, span, seg }] : [];
              });
              // Cascade indent levels for this column's overlapping events.
              const overlapLayout = computeOverlapLayout(
                segments.map(({ todo, seg }) => ({ id: todo.id, startMin: seg.startMin, endMin: seg.endMin })),
              );
              const today = isToday(day);

              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative border-l border-line-subtle cursor-crosshair"
                  onMouseDown={(e) => handleGridMouseDown(e, dateStr)}
                >
                  {/* Current day bright red line */}
                  {today && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none h-[1px] bg-danger mt-px -translate-y-1/2"
                      style={{ top: `${minutesToPx(nowMinutes)}px` }}
                    />
                  )}

                  {/* Hour gridlines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-line-subtle"
                      style={{ top: `${h * HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* Half-hour gridlines */}
                  {HOURS.map((h) => (
                    <div
                      key={`half-${h}`}
                      className="absolute left-0 right-0 border-t border-line-subtle"
                      style={{ top: `${h * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                    />
                  ))}

                  {/* Event cards */}
                  {segments.map(({ todo, span, seg }) => {
                    const indentLevel = overlapLayout.get(todo.id) ?? 0;

                    const isDraggingThis = draggingEvent?.todo.id === todo.id;
                    const isResizingThis = resizingEvent?.todo.id === todo.id;
                    // Stay hidden through the settle window too, so the settling ghost
                    // (not this card at its stale position) is what's on screen. This
                    // matches on id, so BOTH segments of a span hide together.
                    const isSettlingThis = settling?.id === todo.id;

                    return (
                      <div
                        key={todo.id}
                        data-event-card
                        className={isDraggingThis || isResizingThis || isSettlingThis ? 'hidden' : ''} // hide original while dragging / settling
                      >
                        <EventCard
                          todo={todo}
                          startMin={seg.startMin}
                          endMin={seg.endMin}
                          continuesBefore={seg.continuesBefore}
                          continuesAfter={seg.continuesAfter}
                          durationMins={span.absEnd - span.absStart}
                          indentLevel={indentLevel}
                          accent={accentForTodo(todo)}
                          onMouseDown={(e) => handleEventMouseDown(e, todo, span, dateStr)}
                          onResizeStart={(e, edge) => handleEventResizeStart(e, todo, span, dateStr, edge)}
                          // Toggle writes through the task's own bucket (its dueDate),
                          // which is NOT this column for a span's first day.
                          onToggle={() => onToggleTodo(todo.id)}
                        />
                      </div>
                    );
                  })}

                  {/* Ghosts are re-segmented per column from their live span, so one
                      that now crosses midnight previews across both days. */}
                  {(() => {
                    const ghosts: React.ReactNode[] = [];

                    // Active Dragging Event - keeps the card's cascade indent while it
                    // moves. Only while the pointer is over the grid: once it's over the
                    // all-day row that row draws the ghost, so there's exactly one.
                    if (draggingEvent && draggingEvent.zone === 'grid' && draggingEvent.curSpan) {
                      const seg = segmentFor(draggingEvent.curSpan, dateStr);
                      if (seg) ghosts.push(
                        <EventCard
                          key="drag"
                          todo={draggingEvent.todo}
                          accent={accentForTodo(draggingEvent.todo)}
                          startMin={seg.startMin}
                          endMin={seg.endMin}
                          continuesBefore={seg.continuesBefore}
                          continuesAfter={seg.continuesAfter}
                          durationMins={draggingEvent.curSpan.absEnd - draggingEvent.curSpan.absStart}
                          indentLevel={overlapLayout.get(draggingEvent.todo.id) ?? 0}
                          isDragging={true}
                        />
                      );
                    }

                    // Active Resizing Event
                    if (resizingEvent) {
                      const seg = segmentFor(resizingEvent.curSpan, dateStr);
                      if (seg) ghosts.push(
                        <EventCard
                          key="resize"
                          todo={resizingEvent.todo}
                          accent={accentForTodo(resizingEvent.todo)}
                          startMin={seg.startMin}
                          endMin={seg.endMin}
                          continuesBefore={seg.continuesBefore}
                          continuesAfter={seg.continuesAfter}
                          durationMins={resizingEvent.curSpan.absEnd - resizingEvent.curSpan.absStart}
                          indentLevel={overlapLayout.get(resizingEvent.todo.id) ?? 0}
                          isDragging={true} // reuse styling for visual feedback
                        />
                      );
                    }

                    // Settling ghost: covers the drop until the prop echoes the new
                    // time. Rendered in the resting (non-drag) style so the handoff to
                    // the real card is invisible. Only a grid placement draws here - a
                    // task settling into the all-day row is drawn by that row instead.
                    const settlingTodo = settling ? byId.get(settling.id) : undefined;
                    if (settling && settlingTodo && settling.placement.kind === 'grid') {
                      const { span } = settling.placement;
                      const seg = segmentFor(span, dateStr);
                      if (seg) ghosts.push(
                        <EventCard
                          key="settle"
                          todo={settlingTodo}
                          accent={settling.accent}
                          startMin={seg.startMin}
                          endMin={seg.endMin}
                          continuesBefore={seg.continuesBefore}
                          continuesAfter={seg.continuesAfter}
                          durationMins={span.absEnd - span.absStart}
                          indentLevel={overlapLayout.get(settling.id) ?? 0}
                        />
                      );
                    }

                    return ghosts;
                  })()}

                  {/* Active Drag Selection / Creation Preview */}
                  {dragSelection && dragSelection.dateStr === dateStr && (
                    <div
                      className="absolute left-1 right-1 rounded-lg bg-collection-1/30 border border-collection-1/60 pointer-events-none z-10"
                      style={{
                        top: `${minutesToPx(dragSelection.startMins)}px`,
                        height: `${minutesToPx(dragSelection.endMins - dragSelection.startMins)}px`,
                      }}
                    >
                      <div className="p-1 px-2 text-[10px] font-bold text-collection-1">
                        {minutesToTime(dragSelection.startMins)}
                        {' – '}
                        {minutesToTime(dragSelection.endMins)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ending line marking the bottom of the day - mirrors the top header border */}
          <div className="border-t border-line-subtle" />
          {/* Breathing room so the final hours scroll clear of the fixed XP progress bar */}
          <div className="h-26 shrink-0" />
        </div>
      </div>
    </div>
  );
};

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
import { timeToPercentage, formatTime12h, minutesToTime } from '@/common/lib/time';
import { isDone, toggledStatus } from '@/features/tasks/model';
import { collectionOf, showsOnDailyChecklist, todoIndex } from '@/features/tasks/model';
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
  type TodoSpan,
} from './span';

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
const HOVER_RAISE_DELAY_MS = 250; // dwell before a hovered card lifts, so passing over one doesn't bury an indented card

function minutesToPx(mins: number): number {
  return (mins / 60) * HOUR_HEIGHT;
}

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
  onUpdateTodos: (date: string, todos: Todo[]) => void;
  initialDate?: string;
  initialDays?: number;
  hideHeader?: boolean;
  hideMiniCalendar?: boolean;
  // Write-back so the focused day (?date) is deep-linkable; the route wires it.
  onFocusDateChange?: (date: string) => void;
  // Drawing a block creates the task and returns its id; clicking a block (or the
  // freshly created one) opens it in the task full view.
  onCreateTask: (date: string, startTime: string, dueTime: string) => string;
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
  const startLabel = todo.startTime ? formatTime12h(todo.startTime) : '';
  const endLabel = todo.dueTime ? formatTime12h(todo.dueTime) : '';
  const bothTimes = !!todo.startTime && !!todo.dueTime;
  // % 1440 keeps a legacy "24:00" (=1440) classified as AM, matching how
  // formatTime12h renders it - otherwise it reads as PM here and the start time
  // below loses its meridiem, turning 22:00-midnight into "10:00 – 12:00 AM".
  const meridiemPm = (t: string) => timeToMinutes(t) % 1440 >= 720;
  const sameMeridiem =
    bothTimes && meridiemPm(todo.startTime!) === meridiemPm(todo.dueTime!);
  // A span's segments each print only their own real edge, with an arrow toward the
  // day the task continues into - the midnight seam isn't a time worth showing. A
  // span with no time on a side is all-day there (00:00 / 23:59).
  const timeRange = continuesAfter
    ? `${startLabel || formatTime12h('00:00')}`
    : continuesBefore
      ? `${endLabel || formatTime12h('23:59')}`
      : bothTimes
        ? `${sameMeridiem ? startLabel.replace(/\s*(AM|PM)$/i, '') : startLabel} – ${endLabel}`
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
            ? `color-mix(in srgb, ${accent} 40%, canvas 60%)`
            : `color-mix(in srgb, ${accent} 30%, canvas 70%)`),
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
            <div className="absolute cursor-pointer flex items-center justify-center z-50">
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 0.8, opacity: 1 }}
                style={{ color: accent }}
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
            <span className={`text-[10px] truncate text-clip ${isDone(todo) ? 'text-fg-ghost' : 'text-fg-muted'}`}>
              {fullTimeDisplay}
            </span>
          )}
        </div>
      </div>
      {!isSmall && (
        <div className={`text-[10px] pl-4 ${height < 50 ? 'truncate' : ''} ${isDone(todo) ? 'text-fg-ghost' : 'text-fg-muted'
          }`}>
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
  onUpdateTodos,
  initialDate,
  initialDays,
  hideHeader,
  hideMiniCalendar,
  onFocusDateChange,
  onCreateTask,
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
    origSpan: TodoSpan;
    curSpan: TodoSpan;
    grabAbsMins: number;   // absolute minute under the cursor when the drag began
    grabDateStr: string;   // column grabbed in (to measure horizontal column delta)
    startX: number;        // where drag started (to calculate col offset)
    startY: number;        // where drag started Y
  } | null>(null);

  const [resizingEvent, setResizingEvent] = useState<{
    todo: Todo;
    edge: 'top' | 'bottom';
    origSpan: TodoSpan;
    curSpan: TodoSpan;
    startY: number;
  } | null>(null);

  // Post-drop "settling" ghost. onUpdateTodos writes the new time through react-query's
  // optimistic cache, but the echo back into our `dayTodos` prop lands a tick later
  // (the parent re-renders on the query notification, a microtask after the drop). If
  // we simply cleared the drag state on drop, the original card would un-hide at its
  // OLD position for that one frame before the prop catches up - the "flash back, then
  // flash forward". So we keep drawing the card at its dropped spot (and keep the
  // original hidden) until the prop reports the committed time, then release. Same
  // preview-until-echo trick TimeInput uses for its rails.
  const [settling, setSettling] = useState<{
    id: string;
    span: TodoSpan;
    // The bucket we committed into (the NEW dueDate), which is where the echo lands.
    dueDate: string;
    // The exact HH:MM we committed; the ghost lifts once the prop echoes both back.
    expectStart: string;
    expectEnd: string;
    accent: string;
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

  const handleToggleTodo = useCallback((dateStr: string, todoId: string) => {
    const dayData = dayTodos.find(d => d.date === dateStr);
    if (!dayData) return;
    const newTodos = (dayData.todos || []).map(t =>
      t && t.id === todoId ? { ...t, status: toggledStatus(t) } : t
    );
    onUpdateTodos(dateStr, newTodos);
  }, [dayTodos, onUpdateTodos]);

  // Persist a task's new span after a move or resize, and hold the settling ghost.
  //
  // Buckets are keyed by dueDate, and a 2-day task renders in a column that is NOT
  // its dueDate - so the write has to target the task's NEW dueDate bucket and clear
  // it out of the old one. This is the sharp edge: handleUpdateTodos DELETES any todo
  // missing from the list it's handed, so writing to the column the user happened to
  // drag in would delete the task outright.
  const commitSpan = useCallback((todo: Todo, span: TodoSpan) => {
    const patch = decomposeSpan(span);
    const updated = { ...todo, ...patch } as Todo;
    const oldDue = todo.dueDate;
    const newDue = patch.dueDate!;

    if (oldDue === newDue) {
      const bucket = dayTodos.find(d => d.date === newDue);
      onUpdateTodos(newDue, (bucket?.todos || []).map(t => (t && t.id === todo.id ? updated : t)));
    } else {
      const from = dayTodos.find(d => d.date === oldDue);
      const to = dayTodos.find(d => d.date === newDue);
      if (oldDue) onUpdateTodos(oldDue, (from?.todos || []).filter(t => t && t.id !== todo.id));
      onUpdateTodos(newDue, [...(to?.todos || []), updated]);
    }

    setSettling({
      id: todo.id,
      span,
      dueDate: newDue,
      expectStart: patch.startTime!,
      expectEnd: patch.dueTime!,
      accent: accentForTodo(todo),
    });
  }, [dayTodos, onUpdateTodos, accentForTodo]);

  // const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dayPickerRef = useRef<HTMLDivElement>(null);

  // Visible days array
  const visibleDays = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(focusDate, i));
  }, [focusDate, dayCount]);

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

  // Every renderable task, expanded into each day column its span touches.
  //
  // A task used to be read straight out of the dueDate bucket matching the column,
  // which is exactly why one starting the previous day drew as a single short block
  // on its due day. The SPAN picks the columns now: a 2-day task is emitted into
  // both. Anything longer is dropped entirely - the all-day header bar those want
  // isn't built yet.
  //
  // The surface/collection filters run ONCE per task, against its anchor day (the
  // dueDate bucket it lives in) rather than per column. showsOnDailyChecklist is
  // date-specific and is false on a span's first day, so filtering per column would
  // silently hide that half whenever only the Daily surface is enabled.
  const todosByDate = useMemo(() => {
    const map = new Map<string, { todo: Todo; span: TodoSpan }[]>();
    for (const day of dayTodos) {
      for (const t of day.todos || []) {
        // Anything with a start OR an end time gets a block. The 30-minute default
        // for a missing side is applied at render (kept off the todo) so the event
        // card can tell which side was never set and omit it from the label.
        if (!t || !(t.startTime || t.dueTime)) continue;
        // Archived tasks are hidden entirely unless "show archived" is on; the gate
        // owns the archived exclusion, so the planner surface below uses raw
        // showInDatabase (equivalent to showsInOrganizer for non-archived tasks).
        if (t.archived && !showArchived) continue;
        // Stage 1 - base set: the union of the enabled surfaces (both off ⇒ nothing).
        const inSet =
          (showDaily && showsOnDailyChecklist(t, day.date)) || (showPlanner && t.showInDatabase === true);
        // Stage 2 - the uncategorized/collection filters narrow that base set.
        if (!inSet || !passesCollectionFilter(t)) continue;

        const span = todoSpan(t);
        if (!span) continue;
        const firstIdx = Math.floor(span.absStart / MINS_PER_DAY);
        const lastIdx = Math.floor(span.absEnd / MINS_PER_DAY);
        if (lastIdx - firstIdx > 1) continue; // spans 3+ days: not drawn for now
        for (let i = firstIdx; i <= lastIdx; i++) {
          const key = dateStrFromIndex(i);
          const arr = map.get(key);
          if (arr) arr.push({ todo: t, span });
          else map.set(key, [{ todo: t, span }]);
        }
      }
    }
    return map;
  }, [dayTodos, showDaily, showPlanner, showArchived, passesCollectionFilter]);

  const getTodosForDate = useCallback(
    (dateStr: string) => todosByDate.get(dateStr) ?? [],
    [todosByDate]
  );

  // --- Drag Selection for Creation --- //
  const handleGridMouseDown = (e: React.MouseEvent, dateStr: string) => {
    // Ignore right/middle clicks or if clicking on an event
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-event-card]')) return;

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

      // The drawn block *is* the task - create it with those times and hand the
      // user straight to the full view to name it and fill in the rest.
      const id = onCreateTask(dragSelection.dateStr, startTime, dueTime);
      onOpenTask(id);
      setDragSelection(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragSelection, onCreateTask, onOpenTask]);

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
    });
  };

  useEffect(() => {
    if (!draggingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;

      const deltaY = Math.abs(e.clientY - draggingEvent.startY);
      const deltaX = Math.abs(e.clientX - draggingEvent.startX);
      if (deltaY < 3 && deltaX < 3) return; // ignore minimal twitch

      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;

      // Which column the pointer is over (clamped to the visible window). Assumes
      // equal column widths, as before.
      const colWidth = containerRect.width / visibleDays.length;
      const grabColIndex = visibleDays.findIndex(d => format(d, 'yyyy-MM-dd') === draggingEvent.grabDateStr);
      const colsMoved = Math.round((e.clientX - draggingEvent.startX) / colWidth);
      const colIndex = Math.max(0, Math.min(grabColIndex + colsMoved, visibleDays.length - 1));

      // Whole-task move = pointer delta on the absolute timeline, snapped to 15min.
      const pointerAbs =
        dayIndex(format(visibleDays[colIndex], 'yyyy-MM-dd')) * MINS_PER_DAY +
        (relativeY / HOUR_HEIGHT) * 60;
      const delta = Math.round((pointerAbs - draggingEvent.grabAbsMins) / 15) * 15;

      setDraggingEvent(prev => (prev ? { ...prev, curSpan: shiftSpan(prev.origSpan, delta) } : null));
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

      // commitSpan owns the write, including routing the task into its NEW dueDate
      // bucket, and keeps the card painted at its dropped spot until the prop echoes
      // back (see `settling`) so it doesn't flash to the old position first.
      commitSpan(draggingEvent.todo, draggingEvent.curSpan);
      setDraggingEvent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEvent, dayTodos, onUpdateTodos, visibleDays, onOpenTask]);

  // --- Drag Resizing --- //
  const handleEventResizeStart = (e: React.MouseEvent, todo: Todo, span: TodoSpan, edge: 'top' | 'bottom') => {
    if (e.button !== 0) return;
    e.stopPropagation();

    setSettling(null); // a fresh resize supersedes any in-flight settle
    setResizingEvent({ todo, edge, origSpan: span, curSpan: span, startY: e.clientY });
  };

  useEffect(() => {
    if (!resizingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingEvent.startY;
      const deltaMins = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15;

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
  }, [resizingEvent, dayTodos, onUpdateTodos]);

  // Release the settling ghost once the prop reports the time we committed. Until
  // then the ghost covers the gap where the un-hidden original would show its old
  // position. applyTodoBatch always yields a fresh dayTodos, so this re-runs on the
  // echo even for a no-op drop.
  useEffect(() => {
    if (!settling) return;
    // The echo lands in the bucket we wrote into - the task's NEW dueDate.
    const day = dayTodos.find(d => d.date === settling.dueDate);
    const t = day?.todos.find(x => x?.id === settling.id);
    if (t && t.startTime === settling.expectStart && t.dueTime === settling.expectEnd) {
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
                <div className="flex items-center justify-center gap-2">
                  <span className={`text-sm font-bold uppercase tracking-wider ${today ? 'text-[var(--accent2)]' : 'text-fg-ghost'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-bold px-1.5 py-1 rounded-md transition-all ${today
                    ? 'bg-[var(--accent2)] text-canvas'
                    : 'text-fg-muted'
                    }`}>
                    {format(day, 'd')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

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
                          onResizeStart={(e, edge) => handleEventResizeStart(e, todo, span, edge)}
                          // Toggle writes through the task's own bucket (its dueDate),
                          // which is NOT this column for a span's first day.
                          onToggle={() => handleToggleTodo(todo.dueDate ?? dateStr, todo.id)}
                        />
                      </div>
                    );
                  })}

                  {/* Ghosts are re-segmented per column from their live span, so one
                      that now crosses midnight previews across both days. */}
                  {(() => {
                    const ghosts: React.ReactNode[] = [];

                    // Active Dragging Event - keeps the card's cascade indent while it moves.
                    if (draggingEvent) {
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
                    // the real card is invisible.
                    const settlingTodo = settling ? byId.get(settling.id) : undefined;
                    if (settling && settlingTodo) {
                      const seg = segmentFor(settling.span, dateStr);
                      if (seg) ghosts.push(
                        <EventCard
                          key="settle"
                          todo={settlingTodo}
                          accent={settling.accent}
                          startMin={seg.startMin}
                          endMin={seg.endMin}
                          continuesBefore={seg.continuesBefore}
                          continuesAfter={seg.continuesAfter}
                          durationMins={settling.span.absEnd - settling.span.absStart}
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
          <div className="h-24 shrink-0" />
        </div>
      </div>
    </div>
  );
};

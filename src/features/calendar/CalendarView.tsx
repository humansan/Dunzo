import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
import { timeToPercentage, formatTime12h } from '@/common/lib/time';
import { isDone, toggledStatus } from '@/features/tasks/model';
import { collectionOf, showsInOrganizer, showsOnDailyChecklist, todoIndex } from '@/features/tasks/model';
import { collectionColor } from '@/theme/collectionColor';
import { Calendar } from '@/common/ui/Calendar';
import { Switch } from '@/common/ui/Switch';

// ─── Helpers ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const GUTTER_WIDTH = 64; // px — width of the left time-label gutter (the day grid + current-time line start here)
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_OPTIONS = [1, 3, 5, 7];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToPx(mins: number): number {
  return (mins / 60) * HOUR_HEIGHT;
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}



function formatDuration(startMin: number, endMin: number): string {
  const duration = endMin - startMin;
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);

  return parts.length > 0 ? parts.join(' ') : '0 minutes';
}

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
  // CSS color driving the card's fill, spine and dot — see accentForTodo.
  accent: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, edge: 'top' | 'bottom') => void;
  isDragging?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
}> = ({ todo, startMin, endMin, accent, onMouseDown, onResizeStart, isDragging, onToggle }) => {
  const [isHovered, setIsHovered] = useState(false);
  const top = minutesToPx(startMin) + 1;
  const height = Math.max(minutesToPx(endMin - startMin), 15) - 2; // min height 15px
  const isSmall = height <= 35;
  // Only show a time that's actually set — never fabricate the missing side.
  const startLabel = todo.startTime ? formatTime12h(todo.startTime) : '';
  const endLabel = todo.dueTime ? formatTime12h(todo.dueTime) : '';
  const timeRange = `${startLabel} – ${endLabel}`.trim();
  const durationStr = `(${formatDuration(startMin, endMin)})`;
  const fullTimeDisplay = `${timeRange} ${durationStr}`;

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`absolute left-1 right-1 rounded-md px-2 overflow-hidden cursor-pointer transition-opacity flex flex-col ${isSmall ? 'justify-center' : 'justify-start'
        } ${isDone(todo) ? 'opacity-40' : 'opacity-100'
        } ${isDragging ? 'z-50' : 'z-10 ring-1 ring-canvas'}
      `}
      style={{
        top: `${top}px`,
        height: `${height}px`,
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
        <div className={`text-[10px] truncate pl-4 ${isDone(todo) ? 'text-fg-ghost' : 'text-fg-muted'
          }`}>
          {timeRange}
          {' '}
          {durationStr}
        </div>
      )}
      {!isDone(todo) && (
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />
      )}
      {/* Resize handles */}
      {!isDone(todo) && onResizeStart && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize z-20 border-transparent"
            onMouseDown={(e) => onResizeStart(e, 'top')}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize z-20 border-transparent"
            onMouseDown={(e) => onResizeStart(e, 'bottom')}
          />
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
  const [dayCount, setDayCount] = useState(initialDays || 3);
  const [focusDate, setFocusDate] = useState(initialDate ? parseISO(initialDate) : new Date());
  const [miniCalMonth, setMiniCalMonth] = useState(initialDate ? parseISO(initialDate) : new Date());
  const [showDayPicker, setShowDayPicker] = useState(false);
  // Which surfaces' tasks get a block. A task on both surfaces shows if either is on.
  const [showDaily, setShowDaily] = useState(true);
  const [showPlanner, setShowPlanner] = useState(true);

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

  // Moving/Resizing State
  const [draggingEvent, setDraggingEvent] = useState<{
    todo: Todo;
    initialDateStr: string;
    origStartMins: number;
    origEndMins: number;
    startOffsetPx: number; // offset from mouse Y to top of card
    currentMins: number;   // currently dragged start time
    currentDateStr: string;
    startX: number;        // where drag started (to calculate col offset)
    startY: number;        // where drag started Y
  } | null>(null);

  const [resizingEvent, setResizingEvent] = useState<{
    todo: Todo;
    dateStr: string;
    edge: 'top' | 'bottom';
    origStartMins: number;
    origEndMins: number;
    startY: number;
    currentStartMins: number;
    currentEndMins: number;
  } | null>(null);

  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);

  // Daily-only tasks wear the app accent. A Task Planner task wears its collection's
  // color instead, so the calendar reads like the Planner; an uncategorized one is grey.
  const accentForTodo = useCallback(
    (todo: Todo): string => {
      if (todo.showInDatabase !== true) return 'var(--accent1)';
      const collId = collectionOf(todo, byId);
      if (!collId) return 'var(--color-status-todo)';
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

  // const gridRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dayPickerRef = useRef<HTMLDivElement>(null);

  // Visible days array
  const visibleDays = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(focusDate, i));
  }, [focusDate, dayCount]);

  // Auto-scroll to ~7 AM on mount and when focus changes
  useEffect(() => {
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

  // Get todos for a specific date
  const getTodosForDate = useCallback(
    (dateStr: string): Todo[] => {
      const dayData = dayTodos.find((d) => d.date === dateStr);
      // Anything with a start OR an end time gets a block. The 30-minute default
      // for a missing side is applied at render (kept off the todo) so the event
      // card can tell which side was never set and omit it from the label.
      return (dayData?.todos || []).filter(
        (t) =>
          t &&
          (t.startTime || t.dueTime) &&
          // A task living on both surfaces shows while either toggle is on.
          ((showDaily && showsOnDailyChecklist(t, dateStr)) || (showPlanner && showsInOrganizer(t)))
      );
    },
    [dayTodos, showDaily, showPlanner]
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

      // Calculate start and end HH:MM
      const startH = Math.floor(dragSelection.startMins / 60);
      const startM = dragSelection.startMins % 60;
      const endH = Math.floor(dragSelection.endMins / 60);
      const endM = dragSelection.endMins % 60;

      const startTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      const dueTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      // The drawn block *is* the task — create it with those times and hand the
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
  const handleEventMouseDown = (e: React.MouseEvent, todo: Todo, dateStr: string, startMin: number, endMin: number) => {
    // Left click only
    if (e.button !== 0) return;
    e.stopPropagation(); // prevent drag selection

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startOffsetPx = e.clientY - rect.top;

    setDraggingEvent({
      todo,
      initialDateStr: dateStr,
      origStartMins: startMin,
      origEndMins: endMin,
      startOffsetPx,
      currentMins: startMin,
      currentDateStr: dateStr,
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

      // Calculate new time
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top + scrollContainerRef.current.scrollTop;
      const cardTopY = relativeY - draggingEvent.startOffsetPx;

      const rawMins = (cardTopY / HOUR_HEIGHT) * 60;
      let newMins = Math.round(rawMins / 15) * 15;

      const duration = draggingEvent.origEndMins - draggingEvent.origStartMins;
      newMins = Math.max(0, Math.min(newMins, 1440 - duration));

      // Calculate new date based on X movement
      // Assume equal column widths. We find the index of the column
      const colWidth = containerRect.width / visibleDays.length;
      const initialColIndex = visibleDays.findIndex(d => format(d, 'yyyy-MM-dd') === draggingEvent.initialDateStr);

      const deltaMoveX = e.clientX - draggingEvent.startX;
      const colsMoved = Math.round(deltaMoveX / colWidth);
      let newColIndex = initialColIndex + colsMoved;
      newColIndex = Math.max(0, Math.min(newColIndex, visibleDays.length - 1));

      const newDateStr = format(visibleDays[newColIndex], 'yyyy-MM-dd');

      setDraggingEvent(prev => prev ? { ...prev, currentMins: newMins, currentDateStr: newDateStr } : null);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!draggingEvent) return;

      const dist = Math.abs(e.clientX - draggingEvent.startX) + Math.abs(e.clientY - draggingEvent.startY);
      if (dist < 5) {
        // It's a click, not a drag — open the task in the full view.
        onOpenTask(draggingEvent.todo.id);
        setDraggingEvent(null);
        return;
      }

      const { todo, initialDateStr, currentDateStr, currentMins, origStartMins, origEndMins } = draggingEvent;
      const duration = origEndMins - origStartMins;

      const startH = Math.floor(currentMins / 60);
      const startM = currentMins % 60;
      const endMins = currentMins + duration;
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;

      const newStartTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      const newEndTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      // Update the todo
      const updatedTodo = {
        ...todo,
        startTime: newStartTime,
        dueTime: newEndTime,
        duePercentage: timeToPercentage(newEndTime),
      };

      if (initialDateStr === currentDateStr) {
        // Same day update - preserve original order in the array
        const dayData = dayTodos.find(d => d.date === initialDateStr);
        const newTodos = (dayData?.todos || []).map(t => t.id === todo.id ? updatedTodo : t);
        onUpdateTodos(currentDateStr, newTodos);
      } else {
        // Move across days
        const sourceData = dayTodos.find(d => d.date === initialDateStr);
        const targetData = dayTodos.find(d => d.date === currentDateStr);

        const sourceFiltered = (sourceData?.todos || []).filter(t => t.id !== todo.id);
        onUpdateTodos(initialDateStr, sourceFiltered);
        onUpdateTodos(currentDateStr, [...(targetData?.todos || []), updatedTodo]);
      }

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
  const handleEventResizeStart = (e: React.MouseEvent, todo: Todo, dateStr: string, edge: 'top' | 'bottom', startMin: number, endMin: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    setResizingEvent({
      todo,
      dateStr,
      edge,
      origStartMins: startMin,
      origEndMins: endMin,
      startY: e.clientY,
      currentStartMins: startMin,
      currentEndMins: endMin,
    });
  };

  useEffect(() => {
    if (!resizingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingEvent.startY;
      const deltaMins = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15;

      setResizingEvent(prev => {
        if (!prev) return null;
        let newStart = prev.origStartMins;
        let newEnd = prev.origEndMins;

        if (prev.edge === 'top') {
          newStart = Math.max(0, Math.min(prev.origStartMins + deltaMins, prev.origEndMins - 15));
        } else {
          newEnd = Math.max(prev.origStartMins + 15, Math.min(prev.origEndMins + deltaMins, 1440));
        }

        return { ...prev, currentStartMins: newStart, currentEndMins: newEnd };
      });
    };

    const handleMouseUp = () => {
      if (!resizingEvent) return;
      const { todo, dateStr, currentStartMins, currentEndMins } = resizingEvent;

      const startH = Math.floor(currentStartMins / 60);
      const startM = currentStartMins % 60;
      const endH = Math.floor(currentEndMins / 60);
      const endM = currentEndMins % 60;

      const newStartTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      const newEndTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      const updatedTodo = {
        ...todo,
        startTime: newStartTime,
        dueTime: newEndTime,
        duePercentage: timeToPercentage(newEndTime),
      };

      const dayData = dayTodos.find(d => d.date === dateStr);
      const newTodos = (dayData?.todos || []).map(t => t.id === todo.id ? updatedTodo : t);
      onUpdateTodos(dateStr, newTodos);

      setResizingEvent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingEvent, dayTodos, onUpdateTodos]);

  return (
    <div className={`flex ${hideHeader ? 'h-full' : 'h-screen'} max-w-[1400px] mx-auto select-none w-full`}>
      {/* Left side: Mini calendar */}
      {!hideMiniCalendar && (
        <div className="w-56 flex-shrink-0 pr-4 pt-2 hidden lg:block">
          {/* Calendar is h-full; without a content-height wrapper it eats the whole
              screen-height column and pushes the toggles below the fold. */}
          <div className="shrink-0">
            <Calendar
              currentMonth={miniCalMonth}
              onMonthChange={setMiniCalMonth}
              onDateClick={handleMiniCalDateClick}
              focusDate={focusDate}
            />
          </div>

          {/* Which surfaces' tasks get blocked out on the grid. */}
          <div className="mt-5 px-1 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-faint">Show daily tasks</span>
              <Switch checked={showDaily} onChange={setShowDaily} aria-label="Show daily tasks" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-faint">Show task planner tasks</span>
              <Switch checked={showPlanner} onChange={setShowPlanner} aria-label="Show task planner tasks" />
            </div>
          </div>
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
          className="flex-1 overflow-y-auto overflow-x-hidden calendar-scroll"
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
                {/* Global Thin Line — starts at the gutter edge so it spans the full day grid */}
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
              const todos = getTodosForDate(dateStr);
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
                  {todos.map((todo) => {
                    // A missing side defaults to a 30-minute block (start-only →
                    // start..start+30; end-only → end-30..end). The filter guarantees
                    // at least one time is set, so the opposite field is present here.
                    const startMin = todo.startTime
                      ? timeToMinutes(todo.startTime)
                      : Math.max(0, timeToMinutes(todo.dueTime!) - 30);
                    let endMin = todo.dueTime ? timeToMinutes(todo.dueTime) : startMin + 30;
                    if (endMin <= startMin) endMin = startMin + 30;

                    const isDraggingThis = draggingEvent?.todo.id === todo.id;
                    const isResizingThis = resizingEvent?.todo.id === todo.id;

                    return (
                      <div
                        key={todo.id}
                        data-event-card
                        className={isDraggingThis || isResizingThis ? 'hidden' : ''} // hide original while dragging
                      >
                        <EventCard
                          todo={todo}
                          startMin={startMin}
                          endMin={endMin}
                          accent={accentForTodo(todo)}
                          onMouseDown={(e) => handleEventMouseDown(e, todo, dateStr, startMin, endMin)}
                          onResizeStart={(e, edge) => handleEventResizeStart(e, todo, dateStr, edge, startMin, endMin)}
                          onToggle={() => handleToggleTodo(dateStr, todo.id)}
                        />
                      </div>
                    );
                  })}

                  {/* Active Dragging Event */}
                  {draggingEvent && draggingEvent.currentDateStr === dateStr && (
                    <EventCard
                      todo={draggingEvent.todo}
                      accent={accentForTodo(draggingEvent.todo)}
                      startMin={draggingEvent.currentMins}
                      endMin={draggingEvent.currentMins + (draggingEvent.origEndMins - draggingEvent.origStartMins)}
                      isDragging={true}
                    />
                  )}

                  {/* Active Resizing Event */}
                  {resizingEvent && resizingEvent.dateStr === dateStr && (
                    <EventCard
                      todo={resizingEvent.todo}
                      accent={accentForTodo(resizingEvent.todo)}
                      startMin={resizingEvent.currentStartMins}
                      endMin={resizingEvent.currentEndMins}
                      isDragging={true} // reuse styling for visual feedback
                    />
                  )}

                  {/* Active Drag Selection / Creation Preview */}
                  {dragSelection && dragSelection.dateStr === dateStr && (
                    <div
                      className="absolute left-1 right-1 rounded-lg bg-[var(--accent1)]/20 border border-[var(--accent1)]/40 pointer-events-none z-10"
                      style={{
                        top: `${minutesToPx(dragSelection.startMins)}px`,
                        height: `${minutesToPx(dragSelection.endMins - dragSelection.startMins)}px`,
                      }}
                    >
                      <div className="p-1 px-2 text-[10px] font-bold text-[var(--accent1)]">
                        {`${Math.floor(dragSelection.startMins / 60).toString().padStart(2, '0')}:${(dragSelection.startMins % 60).toString().padStart(2, '0')}`}
                        {' – '}
                        {`${Math.floor(dragSelection.endMins / 60).toString().padStart(2, '0')}:${(dragSelection.endMins % 60).toString().padStart(2, '0')}`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ending line marking the bottom of the day — mirrors the top header border */}
          <div className="border-t border-line-subtle" />
          {/* Breathing room so the final hours scroll clear of the fixed XP progress bar */}
          <div className="h-24 shrink-0" />
        </div>
      </div>
    </div>
  );
};

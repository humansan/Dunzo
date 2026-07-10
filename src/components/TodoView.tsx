import React, { useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isSameWeek,
  parseISO,
  eachDayOfInterval,
  endOfWeek
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { btnNeutral, btnToggle } from '../theme/buttons';
import { Todo, DayTodos, Tracker } from '@shared/types';
import { todoIndex, collectionOptions as buildCollectionOptions, showsOnDailyChecklist } from '../utils/todoFilters';
import { timeToPercentage } from '../utils/timeUtils';

import { TrackerCard } from './TrackerCard';
import { CalendarView } from './CalendarView';
import { QuickEditValues } from './QuickEditTodo';
import { XpProgressBar } from './XpProgressBar';
import { StarStreak } from './StarStreak';
import { computeXpStats, getWeeklyXp } from '../utils/xpUtils';
import { ListView } from './ListView';
import { DatePickerPopover } from './DatePickerPopover';

interface TodoViewProps {
  dayTodos: DayTodos[];
  onUpdateTodos: (date: string, todos: Todo[]) => void;
  onMoveTodo: (fromDate: string, toDate: string, updatedTodo: Todo) => void;
  onStartTracking: (id: string) => void;
  activeTodoId: string | null;
  onToggleTodo: (id: string) => void;
  trackers: Tracker[];
  onDeleteTracker: (id: string) => void;
  onEditTracker: (tracker: Tracker) => void;
  weekStartsOn: number;
  onUpdateWeekStartsOn: (val: number) => void;
  countdownMode: 'off' | 'time' | 'percent';
  onUpdateCountdownMode: (val: 'off' | 'time' | 'percent') => void;
  xpEnabled: boolean;
  onCreateCollection: (name: string) => string;
  // The focused day (YYYY-MM-DD) is URL-driven (?date); the route owns it.
  selectedDate: string;
  onSelectDate: (date: string) => void;
  // Opening a task navigates to /task/$taskId (the shared full-view route).
  onOpenTask: (id: string) => void;
  // Drawing a block on the embedded calendar creates a timed task; returns its id.
  onCreateTask: (date: string, startTime: string, dueTime: string) => string;
}

// ─── TodoView ────────────────────────────────────────────────────────────────
export const TodoView: React.FC<TodoViewProps> = ({
  dayTodos,
  onUpdateTodos,
  onMoveTodo,
  onStartTracking,
  activeTodoId,
  onToggleTodo,
  trackers,
  onDeleteTracker,
  onEditTracker,
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  onCreateCollection,
  selectedDate,
  onSelectDate,
  onOpenTask,
  onCreateTask,
}) => {
  const orderedTrackers = useMemo(() => {
    const dayTracker = trackers.find(t => t.type === 'day');
    const others = trackers.filter(t => t.type !== 'day');
    return dayTracker ? [dayTracker, ...others] : others;
  }, [trackers]);

  // `selectedDate` comes from the route (?date); alias the setter so the existing
  // date-nav call sites (prev/next/today/pick) stay unchanged.
  const setSelectedDate = onSelectDate;

  const currentDayData = useMemo(() => {
    return dayTodos.find(d => d.date === selectedDate) || { date: selectedDate, todos: [] };
  }, [dayTodos, selectedDate]);

  // Only todos explicitly sent to the daily list show here; a dated planner task
  // (showInDailyList off) still lives in this day's bucket but stays hidden.
  const dailyTodos = useMemo(
    () => (currentDayData.todos || []).filter(t => t && showsOnDailyChecklist(t, selectedDate)),
    [currentDayData, selectedDate]
  );

  const xpStats = useMemo(
    () => computeXpStats(dayTodos, selectedDate, weekStartsOn),
    [dayTodos, selectedDate, weekStartsOn]
  );

  const weeklyXp = useMemo(() => getWeeklyXp(dayTodos, 4), [dayTodos]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseISO(selectedDate), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    return eachDayOfInterval({
      start,
      end: endOfWeek(start, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
    });
  }, [selectedDate, weekStartsOn]);

  const newTodoId = () => Math.random().toString(36).substr(2, 9);

  const buildTodo = (vals: QuickEditValues): Todo => ({
    id: newTodoId(),
    text: vals.text,
    showInDailyList: true,
    notes: vals.notes || undefined,
    startTime: vals.startTime,
    dueTime: vals.dueTime,
    duePercentage: vals.duePercentage,
    xp: vals.xp,
    status: vals.status ?? "todo",
    priority: vals.priority,
    parentId: vals.parentId ?? undefined,
    createdAt: Date.now(),
  });

  const handleAddTodo = (vals: QuickEditValues) => {
    if (!vals.text.trim()) return;

    const newTodo = buildTodo(vals);
    const target = vals.date;
    if (target === selectedDate) {
      onUpdateTodos(selectedDate, [...currentDayData.todos, newTodo]);
    } else {
      const targetDayData = dayTodos.find(d => d.date === target) || { date: target, todos: [] };
      onUpdateTodos(target, [...targetDayData.todos, newTodo]);
    }
    // Panel stays open (QuickEditTodo resets itself) for rapid entry.
  };

  // "Add task above/below": land the new task next to its anchor in the day's
  // array, which handleUpdateTodos turns back into dailyOrder. A task dated to
  // another day can't be positioned here, so it just joins that day's bucket.
  const addTodoAt = (vals: QuickEditValues, anchorId: string, pos: 'above' | 'below') => {
    if (!vals.text.trim()) return;
    if (vals.date !== selectedDate) {
      handleAddTodo(vals);
      return;
    }
    const all = currentDayData.todos || [];
    const idx = all.findIndex(t => t && t.id === anchorId);
    if (idx === -1) {
      handleAddTodo(vals);
      return;
    }
    const next = [...all];
    next.splice(pos === 'above' ? idx : idx + 1, 0, buildTodo(vals));
    onUpdateTodos(selectedDate, next);
  };

  // Copy a task's fields under a fresh id, placed directly below the original.
  // Completion/tracking stamps belong to the original, so they aren't carried.
  const duplicateTodo = (id: string) => {
    const all = currentDayData.todos || [];
    const idx = all.findIndex(t => t && t.id === id);
    if (idx === -1) return;
    const copy: Todo = {
      ...all[idx],
      id: newTodoId(),
      createdAt: Date.now(),
      completedAt: undefined,
      trackingStartedAt: undefined,
    };
    const next = [...all];
    next.splice(idx + 1, 0, copy);
    onUpdateTodos(selectedDate, next);
  };

  const deleteTodo = (id: string) => {
    const newTodos = (currentDayData.todos || []).filter(t => t && t.id !== id);
    onUpdateTodos(selectedDate, newTodos);
  };

  // Persist edits without closing the panel (used by Save and the unmount flush).
  const persistEdit = (id: string, vals: QuickEditValues) => {
    const todoToEdit = currentDayData.todos.find(t => t && t.id === id);
    if (!todoToEdit) return;

    const updatedTodo: Todo = {
      ...todoToEdit,
      text: vals.text,
      notes: vals.notes || undefined,
      startTime: vals.startTime,
      dueTime: vals.dueTime,
      duePercentage: vals.duePercentage,
      xp: vals.xp,
      status: vals.status,
      priority: vals.priority,
      parentId: vals.parentId ?? undefined
    };

    if (vals.date !== selectedDate) {
      onMoveTodo(selectedDate, vals.date, updatedTodo);
    } else {
      const newTodos = currentDayData.todos.map(t => t && t.id === id ? updatedTodo : t);
      onUpdateTodos(selectedDate, newTodos);
    }
  };

  // The context menu edits one field at a time; round-tripping the row through
  // persistEdit keeps every write on the same path as the quick-edit panel.
  const valuesOf = (todo: Todo): QuickEditValues => ({
    text: todo.text,
    notes: todo.notes || '',
    date: selectedDate,
    startTime: todo.startTime,
    dueTime: todo.dueTime,
    duePercentage: todo.duePercentage,
    xp: todo.xp,
    status: todo.status,
    priority: todo.priority,
    parentId: todo.parentId ?? null,
  });

  const patchTodo = (id: string, patch: (todo: Todo) => Partial<QuickEditValues>) => {
    const todo = currentDayData.todos.find(t => t && t.id === id);
    if (!todo) return;
    persistEdit(id, { ...valuesOf(todo), ...patch(todo) });
  };

  // Clearing the date drops the task off the daily list entirely, so it's only
  // allowed for tasks that also live in the planner (matching the Clear button's
  // visibility in the menu's calendar panel).
  const setTodoDate = (id: string, date: string) => {
    const todo = currentDayData.todos.find(t => t && t.id === id);
    if (!todo || (!date && !todo.showInDatabase)) return;
    patchTodo(id, () => ({ date }));
  };

  // Clearing the end time drops the derived percentage and the start time with
  // it, mirroring the quick editor (a start with no end is meaningless).
  const setTodoTime = (id: string, time: string) =>
    patchTodo(id, (todo) => time
      ? { dueTime: time, duePercentage: timeToPercentage(time), startTime: todo.startTime }
      : { dueTime: undefined, duePercentage: undefined, startTime: undefined });

  const setTodoParent = (id: string, parentId: string | null) =>
    patchTodo(id, () => ({ parentId }));

  // Collection index + options for the quick-edit pickers.
  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const collOptions = useMemo(() => buildCollectionOptions(dayTodos, byId), [dayTodos, byId]);


  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = parseISO(selectedDate);
    const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    // Land on the near edge of the adjacent week (start of next / end of prev)
    // so a single press feels like stepping to the next sequential day.
    const target = direction === 'next'
      ? startOfWeek(addDays(current, 7), { weekStartsOn: wso })
      : endOfWeek(addDays(current, -7), { weekStartsOn: wso });
    // If the landing week contains today, prefer today over the week's edge.
    const today = new Date();
    const landing = isSameWeek(today, target, { weekStartsOn: wso }) ? today : target;
    setSelectedDate(format(landing, 'yyyy-MM-dd'));
  };

  return (
    <div className="mx-auto px-1 pt-2 flex gap-4 h-screen overflow-hidden">
      {/* Left side: Trackers List */}
      <div className="w-[20%] flex-shrink-0 overflow-y-auto pr-1 pb-12 no-scrollbar">
        <div className="flex flex-col gap-3 pt-1">
          <AnimatePresence>
            {orderedTrackers.map((tracker) => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                onDelete={onDeleteTracker}
                onEdit={onEditTracker}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Middle side: Todo List */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-visible no-scrollbar">
        {/* Date Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4 mt-1">
            <div>
              <h2 className="text-xl font-bold text-fg">
                {format(parseISO(selectedDate), 'MMMM yyyy')}
              </h2>
            </div>
            <div className="flex gap-2 items-center">
              <DatePickerPopover
                value={selectedDate}
                onChange={(val) => { if (val) setSelectedDate(val); }}
              >
                {({ open }) => (
                  <button
                    onClick={open}
                    title="Jump to date"
                    className={`p-1.5 rounded-lg ${btnNeutral}`}
                  >
                    <CalendarDays size={16} />
                  </button>
                )}
              </DatePickerPopover>
              <button
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${btnNeutral}`}
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek('prev')}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigateWeek('next')}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-end border-b border-line-subtle pb-3 px-1">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, parseISO(selectedDate));
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${isSelected ? 'text-[var(--accent2)]' : 'text-fg-ghost group-hover:text-fg-subtle'
                    }`}>
                    {format(day, 'EEE')}
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${btnToggle(isSelected)} ${isSelected ? 'scale-110' : ''} ${isToday && !isSelected ? 'ring-2 ring-[var(--accent2)]/40' : ''}`}>
                    {format(day, 'd')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Todo List */}
        <ListView
          todos={dailyTodos}
          date={selectedDate}
          onToggle={onToggleTodo}
          onDelete={deleteTodo}
          onSaveEdit={persistEdit}
          onCommitEdit={persistEdit}
          onOpenFull={onOpenTask}
          onStartTracking={onStartTracking}
          activeTodoId={activeTodoId}
          onAdd={handleAddTodo}
          onAddAt={addTodoAt}
          onDuplicate={duplicateTodo}
          onSetDate={setTodoDate}
          onSetTime={setTodoTime}
          onSetParent={setTodoParent}
          countdownMode={countdownMode}
          collectionOptions={collOptions}
          onCreateCollection={onCreateCollection}
          onReorder={(newTodos) => {
            // ListView only sees the daily-visible subset; keep the day's hidden
            // (dated planner) todos so handleUpdateTodos doesn't delete them.
            const hidden = (currentDayData.todos || []).filter(t => t && !showsOnDailyChecklist(t, selectedDate));
            onUpdateTodos(selectedDate, [...newTodos, ...hidden]);
          }}
        />
        <div className="h-24 shrink-0" />
      </div>

      {/* Right side: 1-Day Calendar */}
      <div className="w-90 shrink-0 hidden lg:block h-full">
        <div className="h-full overflow-hidden flex flex-col">
          <CalendarView
            dayTodos={dayTodos}
            onUpdateTodos={onUpdateTodos}
            initialDate={selectedDate}
            initialDays={1}
            hideHeader={true}
            hideMiniCalendar={true}
            onCreateTask={onCreateTask}
            onOpenTask={onOpenTask}
          />
        </div>
      </div>


      {xpEnabled && (
        <>
          <XpProgressBar stats={xpStats} weeklyXp={weeklyXp} />
          <StarStreak dayTodos={dayTodos} date={selectedDate} />
        </>
      )}

    </div>
  );
};

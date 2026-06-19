import React, { useState, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  parseISO,
  eachDayOfInterval,
  endOfWeek
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { Todo, DayTodos, Tracker } from '../types';
import { todoIndex, collectionOf, collectionOptions as buildCollectionOptions } from '../utils/todoFilters';
import { timeToPercentage } from '../utils/timeUtils';

import { TrackerCard } from './TrackerCard';
import { CalendarView } from './CalendarView';
import { TodoFullView } from './TodoFullView';
import { QuickEditValues } from './QuickEditTodo';
import { XpProgressBar } from './XpProgressBar';
import { StarStreak } from './StarStreak';
import { computeXpStats, getWeeklyXp } from '../utils/xpUtils';
import { ListView } from './ListView';

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
}) => {
  const orderedTrackers = useMemo(() => {
    const dayTracker = trackers.find(t => t.type === 'day');
    const others = trackers.filter(t => t.type !== 'day');
    return dayTracker ? [dayTracker, ...others] : others;
  }, [trackers]);

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [fullViewId, setFullViewId] = useState<string | null>(null);

  const currentDayData = useMemo(() => {
    return dayTodos.find(d => d.date === selectedDate) || { date: selectedDate, todos: [] };
  }, [dayTodos, selectedDate]);

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

  const handleAddTodo = (vals: QuickEditValues) => {
    if (!vals.text.trim()) return;

    const newTodo: Todo = {
      id: Math.random().toString(36).substr(2, 9),
      text: vals.text,
      completed: false,
      showInDailyList: true,
      notes: vals.notes || undefined,
      startTime: vals.startTime,
      dueTime: vals.dueTime,
      duePercentage: vals.duePercentage,
      xp: vals.xp,
      parentId: vals.collectionId ?? undefined,
      createdAt: Date.now(),
      status: "todo",
    };

    const target = vals.date;
    if (target === selectedDate) {
      onUpdateTodos(selectedDate, [...currentDayData.todos, newTodo]);
    } else {
      const targetDayData = dayTodos.find(d => d.date === target) || { date: target, todos: [] };
      onUpdateTodos(target, [...targetDayData.todos, newTodo]);
    }
    // Panel stays open (QuickEditTodo resets itself) for rapid entry.
  };

  const deleteTodo = (id: string) => {
    const newTodos = (currentDayData.todos || []).filter(t => t && t.id !== id);
    onUpdateTodos(selectedDate, newTodos);
  };

  // Drop an untimed todo onto the calendar as a 30-minute block starting at the
  // current hour, so the user can then drag it to whatever time they want.
  const addToCalendar = (id: string) => {
    const todo = (currentDayData.todos || []).find(t => t && t.id === id);
    if (!todo) return;
    const fmt = (m: number) =>
      `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
    const startMins = new Date().getHours() * 60;
    const endMins = Math.min(startMins + 30, 23 * 60 + 59);
    const startTime = fmt(startMins);
    const dueTime = fmt(endMins);
    const updated: Todo = { ...todo, startTime, dueTime, duePercentage: timeToPercentage(dueTime) };
    onUpdateTodos(selectedDate, currentDayData.todos.map(t => t && t.id === id ? updated : t));
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
      parentId: vals.collectionId ?? undefined
    };

    if (vals.date !== selectedDate) {
      onMoveTodo(selectedDate, vals.date, updatedTodo);
    } else {
      const newTodos = currentDayData.todos.map(t => t && t.id === id ? updatedTodo : t);
      onUpdateTodos(selectedDate, newTodos);
    }
  };

  // Full view: locate the todo (and the day it lives on) by id across all days,
  // so the panel stays open even if the date is changed from within it.
  const fullViewData = useMemo(() => {
    if (!fullViewId) return null;
    for (const d of dayTodos) {
      const t = (d.todos || []).find(x => x && x.id === fullViewId);
      if (t) return { todo: t, date: d.date };
    }
    return null;
  }, [fullViewId, dayTodos]);

  // Collection index + options for the quick-edit / full-view pickers.
  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const collOptions = useMemo(() => buildCollectionOptions(dayTodos, byId), [dayTodos, byId]);

  const saveFullTodo = (updated: Todo, newDate: string) => {
    let oldDate = newDate;
    for (const d of dayTodos) {
      if ((d.todos || []).some(t => t && t.id === updated.id)) { oldDate = d.date; break; }
    }
    if (newDate !== oldDate) {
      onMoveTodo(oldDate, newDate, updated);
    } else {
      const day = dayTodos.find(d => d.date === oldDate);
      const newTodos = (day?.todos || []).map(t => t && t.id === updated.id ? updated : t);
      onUpdateTodos(oldDate, newTodos);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = parseISO(selectedDate);
    const next = addDays(current, direction === 'prev' ? -7 : 7);
    setSelectedDate(format(next, 'yyyy-MM-dd'));
  };

  const datePickerRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    const input = datePickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
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
              <h2 className="text-xl font-bold text-white">
                {format(parseISO(selectedDate), 'MMMM yyyy')}
              </h2>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <button
                  onClick={openDatePicker}
                  title="Jump to date"
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
                >
                  <CalendarDays size={16} />
                </button>
                <input
                  ref={datePickerRef}
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  style={{ colorScheme: 'dark' }}
                  className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
              <button
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all text-xs font-semibold"
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek('prev')}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigateWeek('next')}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-end border-b border-white/5 pb-3 px-1">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, parseISO(selectedDate));
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${isSelected ? 'text-[var(--accent2)]' : 'text-white/30 group-hover:text-white/60'
                    }`}>
                    {format(day, 'EEE')}
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${isSelected
                    ? 'bg-(--accent2) text-black scale-110'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                    } ${isToday && !isSelected ? 'ring-2 ring-[var(--accent2)]/40' : ''}`}>
                    {format(day, 'd')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Todo List */}
        <ListView
          todos={currentDayData.todos || []}
          date={selectedDate}
          onToggle={onToggleTodo}
          onDelete={deleteTodo}
          onSaveEdit={persistEdit}
          onCommitEdit={persistEdit}
          onOpenFull={(id) => setFullViewId(id)}
          onAddToCalendar={addToCalendar}
          onStartTracking={onStartTracking}
          activeTodoId={activeTodoId}
          onAdd={handleAddTodo}
          countdownMode={countdownMode}
          collectionOptions={collOptions}
          onCreateCollection={onCreateCollection}
          initialCollectionIdOf={(todo) => collectionOf(todo, byId)}
          onReorder={(newTodos) => onUpdateTodos(selectedDate, newTodos)}
        />
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
          />
        </div>
      </div>

      <AnimatePresence>
        {fullViewData && (
          <TodoFullView
            key={fullViewData.todo.id}
            todo={fullViewData.todo}
            date={fullViewData.date}
            collectionOptions={collOptions}
            onCreateCollection={onCreateCollection}
            byId={byId}
            onClose={() => setFullViewId(null)}
            onSave={saveFullTodo}
            onToggle={onToggleTodo}
            onDelete={(id) => {
              const loc = dayTodos.find(d => (d.todos || []).some(t => t && t.id === id));
              if (loc) onUpdateTodos(loc.date, (loc.todos || []).filter(t => t && t.id !== id));
            }}
          />
        )}
      </AnimatePresence>

      {xpEnabled && (
        <>
          <XpProgressBar stats={xpStats} weeklyXp={weeklyXp} />
          <StarStreak dayTodos={dayTodos} date={selectedDate} />
        </>
      )}

    </div>
  );
};

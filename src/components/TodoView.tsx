import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  GripVertical,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  CheckSquare,
  Maximize2,
  Sparkles,
  X
} from 'lucide-react';
// import CircleCheckCutout from "../assets/circle-check-cutout.svg?react";
import CheckCircleCutout from '../assets/CheckCircleCutout';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Todo, DayTodos, Tracker } from '../types';
import { formatTime12h } from '../utils/timeUtils';

import { TrackerCard } from './TrackerCard';
import { CalendarView } from './CalendarView';
import { TodoFullView } from './TodoFullView';
import { QuickEditTodo, QuickEditValues } from './QuickEditTodo';

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
}

interface SortableItemProps {
  todo: Todo;
  date: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, vals: QuickEditValues) => void;
  onCommitEdit: (id: string, vals: QuickEditValues) => void;
  onOpenFull: (id: string) => void;
  onStartTracking: (id: string) => void;
  isActive: boolean;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
}

interface TodoItemProps {
  todo: Todo;
  date: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, vals: QuickEditValues) => void;
  onCommitEdit: (id: string, vals: QuickEditValues) => void;
  onOpenFull: (id: string) => void;
  onStartTracking: (id: string) => void;
  isActive: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
}

const TodoItem: React.FC<TodoItemProps> = ({
  todo,
  date,
  onToggle,
  onDelete,
  onEdit,
  isEditing,
  onCancelEdit,
  onSaveEdit,
  onCommitEdit,
  onOpenFull,
  onStartTracking,
  isActive,
  isDragging,
  style,
  attributes,
  listeners,
  setNodeRef,
  now,
  countdownMode
}) => {
  const countdownDisplay = useMemo(() => {
    if (countdownMode === 'off' || !todo.endTime) return null;

    const [hours, minutes] = todo.endTime.split(':').map(Number);
    const [year, month, day] = date.split('-').map(Number);
    const target = new Date(year, month - 1, day, hours, minutes, 0, 0);

    const diff = target.getTime() - now.getTime();
    if (diff <= 0) {
      return countdownMode === 'percent' ? '0%' : '00:00';
    }

    if (countdownMode === 'percent') {
      const pct = Math.max(0, Math.round((diff / (24 * 60 * 60 * 1000)) * 100));
      return `${pct}%`;
    } else {
      const totalSeconds = Math.floor(diff / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }, [todo.endTime, todo.startTime, date, now, countdownMode]);

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <QuickEditTodo
          mode="edit"
          initialText={todo.text}
          initialNotes={todo.notes || ''}
          initialDate={date}
          initialTime={todo.endTime}
          initialPercent={todo.percentageGoal}
          initialXp={todo.xp}
          onSubmit={(vals) => onSaveEdit(todo.id, vals)}
          onCancel={onCancelEdit}
          onOpenFull={() => onOpenFull(todo.id)}
          onFlush={(vals) => onCommitEdit(todo.id, vals)}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group flex items-center gap-2 py-1 border-b border-white/5 ${isDragging ? 'opacity-0' : ''
        }`}
    >
      {/* {todo.completed && (
        <motion.div
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-(--accent1) pointer-events-none"
        />
      )} */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-white/40 hover:text-white/70 transition-all"
      >
        <GripVertical size={18} />
      </button>

      <button
        onClick={() => onToggle(todo.id)}
        className="relative cursor-pointer py-1"
      >
        <motion.div
          animate={todo.completed ? { scale: [1.3, 1], rotate: [15, 0] } : {}}
          transition={{ duration: 0.3 }}
          className={`transition-colors duration-100 ${todo.completed ? 'text-(--accent1)' : 'text-white/50 hover:text-white'}`}
        >
          {todo.completed ? <CheckCircleCutout size={21} strokeWidth={2.5} /> : <Circle size={21} strokeWidth={2.5} />}
        </motion.div>
      </button>

      <div className="flex items-center gap-1.5 min-w-0">
        <div className="min-w-0 cursor-default group/text" onClick={() => onEdit(todo)}>
          <p className={`text-md transition duration-200 ease-out font-medium truncate ${todo.completed
            ? 'text-white/25 line-through translate-x-[3px]'
            : 'text-white group-hover/text:text-(--accent2)'
            }`}>
            {todo.text}
          </p>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onOpenFull(todo.id); }}
          title="Open full view"
          className="opacity-0 group-hover:opacity-100 p-1 text-white/50 hover:text-white/80 hover:bg-white/5 rounded-md transition-all shrink-0"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {todo.xp !== undefined && (
          <div className={`flex items-center justify-center gap-1.5 px-2.75 py-[5.5px] rounded-lg text-[13px] leading-none font-mono font-medium ${todo.completed
            ? 'bg-white/5 text-white/20'
            : 'bg-[#ffba44]/10 text-[#ffba44]'
            }`}>
            <Sparkles size={16} />
            <span className="relative top-px">{todo.xp} XP</span>
          </div>
        )}

        {(todo.endTime || todo.percentageGoal !== undefined) && (
          <div
            onClick={() => onStartTracking(todo.id)}
            className={`flex items-center justify-center gap-2 px-2.75 cursor-pointer py-[5.5px] rounded-lg transition ${todo.completed
              ? 'bg-white/5 shadow-none'
              : isActive
                ? 'bg-[var(--accent1)] shadow-lg shadow-[var(--accent1)]/10'
                : 'bg-[var(--accent1)]/7 shadow-none hover:bg-[var(--accent1)]/15'
              }`}>
            {todo.endTime && (
              <div className={`flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
                }`}>
                <Clock size={16} />
                <span className="relative top-px">{formatTime12h(todo.endTime)}</span>
              </div>
            )}
            {todo.endTime && todo.percentageGoal !== undefined && (
              <div className={`w-px h-4 transition-colors duration-500 ${todo.completed
                ? 'bg-white/10'
                : isActive
                  ? 'bg-black/20'
                  : 'bg-[var(--accent1)]/20'
                }`} />
            )}
            {todo.percentageGoal !== undefined && (
              <div className={`text-[13px] leading-none font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
                }`}>
                <span className="relative top-px">{Number.isInteger(todo.percentageGoal) ? todo.percentageGoal : Math.round(todo.percentageGoal)}%</span>
              </div>
            )}
          </div>
        )}

        {countdownDisplay && !todo.completed && (
          <div className={`flex items-center gap-2 px-2.75 h-[27px] rounded-lg transition-colors duration-500 ${isActive ? 'bg-[#d93d42] text-white' : 'bg-white/5 text-[#D93D42]'}`}>
            <div className="text-[13px] leading-none font-mono font-medium">
              <span className="relative top-px"> {countdownDisplay} </span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-white/40 hover:text-red-400 hover:bg-[#d93d42]/10 rounded-lg transition-all"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

const SortableTodoItem: React.FC<SortableItemProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: props.todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <TodoItem
      {...props}
      setNodeRef={setNodeRef}
      style={style}
      attributes={attributes}
      listeners={listeners}
      isDragging={isDragging}
      now={props.now}
    />
  );
};


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
}) => {
  const orderedTrackers = useMemo(() => {
    const dayTracker = trackers.find(t => t.type === 'day');
    const others = trackers.filter(t => t.type !== 'day');
    return dayTracker ? [dayTracker, ...others] : others;
  }, [trackers]);

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullViewId, setFullViewId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentDayData = useMemo(() => {
    return dayTodos.find(d => d.date === selectedDate) || { date: selectedDate, todos: [] };
  }, [dayTodos, selectedDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseISO(selectedDate), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    return eachDayOfInterval({
      start,
      end: endOfWeek(start, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
    });
  }, [selectedDate, weekStartsOn]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const todos = currentDayData.todos || [];
      const oldIndex = todos.findIndex(t => t && t.id === active.id);
      const newIndex = todos.findIndex(t => t && t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newTodos = arrayMove(todos, oldIndex, newIndex);
        onUpdateTodos(selectedDate, newTodos);
      }
    }
  };

  // Open the add panel, closing (and flushing) any open edit panel first.
  const openAddPanel = () => {
    setEditingId(null);
    setIsAdding(true);
  };

  // Open an edit panel, closing the add panel first.
  const openEditPanel = (id: string) => {
    setIsAdding(false);
    setEditingId(id);
  };

  const handleAddTodo = (vals: QuickEditValues) => {
    if (!vals.text.trim()) return;

    const newTodo: Todo = {
      id: Math.random().toString(36).substr(2, 9),
      text: vals.text,
      completed: false,
      notes: vals.notes || undefined,
      endTime: vals.endTime,
      percentageGoal: vals.percentageGoal,
      xp: vals.xp,
      createdAt: Date.now()
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

  // Persist edits without closing the panel (used by Save and the unmount flush).
  const persistEdit = (id: string, vals: QuickEditValues) => {
    const todoToEdit = currentDayData.todos.find(t => t && t.id === id);
    if (!todoToEdit) return;

    const updatedTodo: Todo = {
      ...todoToEdit,
      text: vals.text,
      notes: vals.notes || undefined,
      endTime: vals.endTime,
      percentageGoal: vals.percentageGoal,
      xp: vals.xp
    };

    if (vals.date !== selectedDate) {
      onMoveTodo(selectedDate, vals.date, updatedTodo);
    } else {
      const newTodos = currentDayData.todos.map(t => t && t.id === id ? updatedTodo : t);
      onUpdateTodos(selectedDate, newTodos);
    }
  };

  const saveEdit = (id: string, vals: QuickEditValues) => {
    persistEdit(id, vals);
    setEditingId(null);
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

  // Unique tags used across every todo, for the full-view autocomplete.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const d of dayTodos) {
      for (const t of (d.todos || [])) {
        (t?.tags || []).forEach(tag => set.add(tag));
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dayTodos]);

  const saveFullTodo = (updated: Todo, newDate: string) => {
    // Find the date the todo currently lives on
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

  const activeTodo = useMemo(() =>
    currentDayData.todos.find(t => t && t.id === activeId),
    [currentDayData.todos, activeId]
  );

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
                  <span className={`text-[11px] font-bold uppercase tracking-widest transition-colors ${isSelected ? 'text-[var(--accent2)]' : 'text-white/30 group-hover:text-white/60'
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
        <div className="space-y-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={(currentDayData.todos || []).map(t => t?.id).filter(Boolean) as string[]}
              strategy={verticalListSortingStrategy}
            >
              {(currentDayData.todos || []).map((todo, index) => {
                if (!todo || !todo.id) return null;
                return (
                  <SortableTodoItem
                    key={todo.id}
                    todo={todo}
                    date={selectedDate}
                    onToggle={onToggleTodo}
                    onDelete={deleteTodo}
                    onEdit={(t) => openEditPanel(t.id)}
                    isEditing={editingId === todo.id}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={saveEdit}
                    onCommitEdit={persistEdit}
                    onOpenFull={(id) => setFullViewId(id)}
                    onStartTracking={onStartTracking}
                    isActive={activeTodoId === todo.id}
                    now={now}
                    countdownMode={countdownMode}
                  />
                );
              })}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeId && activeTodo ? (
                <TodoItem
                  todo={activeTodo}
                  date={selectedDate}
                  onToggle={() => { }}
                  onDelete={() => { }}
                  onEdit={() => { }}
                  isEditing={false}
                  onCancelEdit={() => { }}
                  onSaveEdit={() => { }}
                  onCommitEdit={() => { }}
                  onOpenFull={() => { }}
                  onStartTracking={() => { }}
                  isActive={activeTodoId === activeTodo.id}
                  now={now}
                  countdownMode={countdownMode}
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add Todo Inline */}
          {!isAdding ? (
            <button
              onClick={openAddPanel}
              className="flex items-center gap-2 py-2 text-white/25 hover:text-white/50 transition-all group duration-100"
            >
              <GripVertical size={18} className="invisible" />
              <Plus size={21} strokeWidth={2.5} />
              <span className="text-md font-medium">Add a todo</span>
            </button>
          ) : (
            <QuickEditTodo
              mode="add"
              initialDate={selectedDate}
              onSubmit={handleAddTodo}
              onCancel={() => setIsAdding(false)}
            />
          )}

          {currentDayData.todos.length === 0 && !isAdding && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-20">
              <CheckSquare className="w-12 h-12" />
              <p className="text-xs font-medium">Clear schedule for this day</p>
            </div>
          )}
        </div>
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
            allTags={allTags}
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

    </div>
  );
};

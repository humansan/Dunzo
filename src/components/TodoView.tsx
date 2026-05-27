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
  GripVertical,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  CheckSquare,
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
import { timeToPercentage, percentageToTime, formatTime12h } from '../utils/timeUtils';

import { TrackerCard } from './TrackerCard';
import { CalendarView } from './CalendarView';

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
  onSaveEdit: (id: string, text: string, time: string, percent: string, newDate: string) => void;
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
  onSaveEdit: (id: string, text: string, time: string, percent: string, newDate: string) => void;
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
  const [editText, setEditText] = useState(todo.text);
  const [editTime, setEditTime] = useState(todo.endTime || '');
  const [editPercent, setEditPercent] = useState(todo.percentageGoal?.toString() || '');
  const [editDate, setEditDate] = useState(date);

  // Sync internal state when todo or date changes
  React.useEffect(() => {
    setEditText(todo.text);
    setEditTime(todo.endTime || '');
    setEditPercent(todo.percentageGoal?.toString() || '');
    setEditDate(date);
  }, [todo, date]);


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

  const handleTimeChange = (val: string) => {
    setEditTime(val);
    const p = timeToPercentage(val);
    if (p !== undefined) setEditPercent(p.toString());
  };

  const handlePercentChange = (val: string) => {
    setEditPercent(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const t = percentageToTime(num);
      if (t) setEditTime(t);
    }
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-4 bg-[#1A1A1A] border border-[var(--accent2)]/30 rounded-2xl shadow-xl space-y-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSaveEdit(todo.id, editText, editTime, editPercent, editDate);
          if (e.key === 'Escape') onCancelEdit();
        }}
      >
        <input
          autoFocus
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 h-9 text-white focus:outline-none focus:border-[var(--accent2)] transition-colors text-sm"
        />
        <div className="flex gap-3">
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            style={{ colorScheme: 'dark' }}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)]"
          />
          <input
            type="time"
            value={editTime}
            onChange={(e) => handleTimeChange(e.target.value)}
            style={{ colorScheme: 'dark' }}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)]"
          />
          <input
            type="number"
            step="any"
            value={editPercent}
            onChange={(e) => handlePercentChange(e.target.value)}
            placeholder="%"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSaveEdit(todo.id, editText, editTime, editPercent, editDate)}
            className="flex-1 bg-[var(--accent2)] hover:opacity-90 text-black font-bold py-2 rounded-lg text-xs transition-all"
          >
            Save Changes
          </button>
          <button
            onClick={onCancelEdit}
            className="px-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-xs font-bold transition-all"
          >
            Cancel
          </button>
        </div>
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
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 transition-all"
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
          className={`transition-colors duration-100 ${todo.completed ? 'text-[var(--accent1)]' : 'text-white/50 hover:text-white'}`}
        >
          {todo.completed ? <CheckCircleCutout size={21} strokeWidth={2.5} /> : <Circle size={21} strokeWidth={2.5} />}
        </motion.div>
      </button>

      <div className="flex-1 min-w-0 cursor-default group/text" onClick={() => onEdit(todo)}>
        <p className={`text-md transition duration-300 font-medium ${todo.completed
          ? 'text-white/30 line-through translate-x-[2px]'
          : 'text-white group-hover/text:text-[var(--accent2)]'
          }`}>
          {todo.text}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {(todo.endTime || todo.percentageGoal !== undefined) && (
          <div
            onClick={() => onStartTracking(todo.id)}
            className={`flex items-center gap-2 px-3 cursor-pointer py-1 rounded-lg transition ${todo.completed
              ? 'bg-white/5 shadow-none'
              : isActive
                ? 'bg-[var(--accent1)] shadow-lg shadow-[var(--accent1)]/10'
                : 'bg-white/5 shadow-none hover:bg-white/10'
              }`}>
            {todo.endTime && (
              <div className={`flex items-center gap-1.5 text-sm font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
                }`}>
                <Clock size={16} />
                {formatTime12h(todo.endTime)}
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
              <div className={`text-sm font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
                }`}>
                {Number.isInteger(todo.percentageGoal) ? todo.percentageGoal : Math.round(todo.percentageGoal)}%
              </div>
            )}
          </div>
        )}

        {countdownDisplay && !todo.completed && (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors duration-500 ${isActive ? 'bg-[#D93D42] text-white' : 'bg-white/5 text-[#D93D42]'}`}>
            <div className="text-sm font-mono font-bold">
              {countdownDisplay}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 p-2 text-white/10 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
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
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoTime, setNewTodoTime] = useState('');
  const [newTodoPercent, setNewTodoPercent] = useState<string>('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleNewTimeChange = (val: string) => {
    setNewTodoTime(val);
    const p = timeToPercentage(val);
    if (p !== undefined) setNewTodoPercent(p.toString());
  };

  const handleNewPercentChange = (val: string) => {
    setNewTodoPercent(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const t = percentageToTime(num);
      if (t) setNewTodoTime(t);
    }
  };

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

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    const newTodo: Todo = {
      id: Math.random().toString(36).substr(2, 9),
      text: newTodoText,
      completed: false,
      endTime: newTodoTime || undefined,
      percentageGoal: newTodoPercent ? parseFloat(newTodoPercent) : undefined,
      createdAt: Date.now()
    };

    onUpdateTodos(selectedDate, [...currentDayData.todos, newTodo]);
    setNewTodoText('');
    setNewTodoTime('');
    setNewTodoPercent('');
    setIsAdding(false);
  };

  const deleteTodo = (id: string) => {
    const newTodos = (currentDayData.todos || []).filter(t => t && t.id !== id);
    onUpdateTodos(selectedDate, newTodos);
  };

  const saveEdit = (id: string, text: string, time: string, percent: string, newDate: string) => {
    const todoToEdit = currentDayData.todos.find(t => t && t.id === id);
    if (!todoToEdit) return;

    const updatedTodo = {
      ...todoToEdit,
      text,
      endTime: time || undefined,
      percentageGoal: percent ? parseFloat(percent) : undefined
    };

    if (newDate !== selectedDate) {
      // Remove from current date
      const newCurrentTodos = currentDayData.todos.filter(t => t && t.id !== id);
      onUpdateTodos(selectedDate, newCurrentTodos);

      // Add to new date
      const targetDayData = dayTodos.find(d => d.date === newDate) || { date: newDate, todos: [] };
      onUpdateTodos(newDate, [...targetDayData.todos, updatedTodo]);
    } else {
      // Just update in current date
      const newTodos = currentDayData.todos.map(t => t && t.id === id ? updatedTodo : t);
      onUpdateTodos(selectedDate, newTodos);
    }
    setEditingId(null);
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



  return (
    <div className="mx-auto px-3 pt-2 flex gap-4 h-screen overflow-hidden">
      {/* Left side: Trackers List */}
      <div className="w-[18%] flex-shrink-0 overflow-y-auto pr-1 pb-12 no-scrollbar">
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
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-visible pl-5 pb-12 no-scrollbar">
        {/* Date Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-white">
                {format(parseISO(selectedDate), 'MMMM yyyy')}
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigateWeek('prev')}
                className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => navigateWeek('next')}
                className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl transition-all"
              >
                <ChevronRight size={20} />
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
                  <span className={`text-[11px] font-bold uppercase tracking-widest transition-colors ${isSelected ? 'text-[var(--accent2)]' : 'text-white/20 group-hover:text-white/40'
                    }`}>
                    {format(day, 'EEE')}
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${isSelected
                    ? 'bg-[var(--accent2)] text-black shadow-lg shadow-[var(--accent2)]/20 scale-110'
                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                    } ${isToday && !isSelected ? 'ring-2 ring-[var(--accent2)]/20' : ''}`}>
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
                    onEdit={(t) => setEditingId(t.id)}
                    isEditing={editingId === todo.id}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={saveEdit}
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
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 py-2 text-white/25 hover:text-white/50 transition-all group duration-100"
            >
              <GripVertical size={18} className="invisible" />
              <Plus size={21} strokeWidth={2.5} />
              <span className="text-md font-medium">Add a todo</span>
            </button>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleAddTodo}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTodo(e as any);
                }
                if (e.key === 'Escape') setIsAdding(false);
              }}
              className="p-4 bg-[#1A1A1A] border border-[var(--accent2)]/30 rounded-2xl shadow-xl space-y-3"
            >
              <input
                autoFocus
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white focus:outline-none focus:border-[var(--accent2)] transition-colors text-sm
"
              />

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 pl-1">End Time</label>
                  <input
                    type="time"
                    value={newTodoTime}
                    onChange={(e) => handleNewTimeChange(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)]"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 pl-1">Percentage</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={newTodoPercent}
                    onChange={(e) => handleNewPercentChange(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    placeholder="e.g. 50"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-[var(--accent2)] hover:opacity-90 text-black font-bold h-8 rounded-lg text-xs transition-all"
                >
                  Add Objective
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-xs font-bold transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.form>
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
      <div className="w-[360px] flex-shrink-0 hidden lg:block h-full">
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

    </div>
  );
};

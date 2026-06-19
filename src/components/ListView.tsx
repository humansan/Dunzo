import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  GripVertical,
  Trash2,
  Circle,
  Clock,
  CheckSquare,
  Maximize2,
  CalendarPlus,
  Sparkles,
} from 'lucide-react';
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
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Todo } from '../types';
import { CollectionOption } from '../utils/todoFilters';
import { formatTime12h } from '../utils/timeUtils';
import { QuickEditTodo, QuickEditValues } from './QuickEditTodo';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  onAddToCalendar?: (id: string) => void;
  onStartTracking: (id: string) => void;
  isActive: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
  initialCollectionId?: string | null;
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
  onAddToCalendar: (id: string) => void;
  onStartTracking: (id: string) => void;
  isActive: boolean;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
  collectionOptions: CollectionOption[];
  onCreateCollection: (name: string) => string;
  initialCollectionId: string | null;
}

export interface ListViewProps {
  todos: Todo[];
  date: string;
  /** 'compact' = current daily list style. 'expanded' = future mode with sections/hierarchy. */
  mode?: 'compact' | 'expanded';
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  /** Called when the user confirms an edit (save + close). ListView closes the panel after calling this. */
  onSaveEdit: (id: string, vals: QuickEditValues) => void;
  /** Called on unmount-flush without closing the panel. */
  onCommitEdit: (id: string, vals: QuickEditValues) => void;
  onOpenFull: (id: string) => void;
  onAddToCalendar?: (id: string) => void;
  onStartTracking?: (id: string) => void;
  activeTodoId?: string | null;
  onAdd: (vals: QuickEditValues) => void;
  countdownMode?: 'off' | 'time' | 'percent';
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
  initialCollectionIdOf?: (todo: Todo) => string | null;
  onReorder: (todos: Todo[]) => void;
}

// ── TodoItem ──────────────────────────────────────────────────────────────────

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
  onAddToCalendar,
  onStartTracking,
  isActive,
  isDragging,
  style,
  attributes,
  listeners,
  setNodeRef,
  now,
  countdownMode,
  collectionOptions = [],
  onCreateCollection,
  initialCollectionId = null,
}) => {
  const countdownDisplay = useMemo(() => {
    if (countdownMode === 'off' || !todo.dueTime) return null;

    const [hours, minutes] = todo.dueTime.split(':').map(Number);
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
  }, [todo.dueTime, todo.startTime, date, now, countdownMode]);

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <QuickEditTodo
          mode="edit"
          initialText={todo.text}
          initialNotes={todo.notes || ''}
          initialDate={date}
          initialStartTime={todo.startTime}
          initialTime={todo.dueTime}
          initialPercent={todo.duePercentage}
          initialXp={todo.xp}
          initialCollectionId={initialCollectionId}
          collectionOptions={collectionOptions}
          onCreateCollection={onCreateCollection}
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
      className={`relative group flex items-center gap-2 py-1 border-b border-white/5 ${isDragging ? 'opacity-0' : ''}`}
    >
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
          <Maximize2 size={14} />
        </button>

        {!todo.startTime && !todo.dueTime && onAddToCalendar && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToCalendar(todo.id); }}
            title="Add to calendar"
            className="opacity-0 group-hover:opacity-100 p-1 text-white/50 hover:text-white/80 hover:bg-white/5 rounded-md transition-all shrink-0"
          >
            <CalendarPlus size={14} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {todo.xp !== undefined && (
          <div className={`flex items-center justify-center gap-1.5 px-2.75 py-[5.5px] rounded-lg text-[13px] leading-none font-mono font-medium ${todo.completed
            ? 'bg-white/5 text-white/20'
            : 'bg-[#ffba44]/6 text-[#ffba44]'
          }`}>
            <Sparkles size={16} />
            <span className="relative top-px">{todo.xp} XP</span>
          </div>
        )}

        {(todo.dueTime || todo.duePercentage !== undefined) && (
          <div
            onClick={() => onStartTracking(todo.id)}
            className={`flex items-center justify-center gap-2 px-2.75 cursor-pointer py-[5.5px] rounded-lg transition ${todo.completed
              ? 'bg-white/5 shadow-none'
              : isActive
                ? 'bg-[var(--accent1)] shadow-lg shadow-[var(--accent1)]/10'
                : 'bg-[var(--accent1)]/6 shadow-none hover:bg-[var(--accent1)]/15'
            }`}>
            {todo.dueTime && (
              <div className={`flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
              }`}>
                <Clock size={16} />
                <span className="relative top-px">{formatTime12h(todo.dueTime)}</span>
              </div>
            )}
            {todo.dueTime && todo.duePercentage !== undefined && (
              <div className={`w-px h-4 transition-colors duration-500 ${todo.completed
                ? 'bg-white/10'
                : isActive
                  ? 'bg-black/20'
                  : 'bg-[var(--accent1)]/20'
              }`} />
            )}
            {todo.duePercentage !== undefined && (
              <div className={`text-[13px] leading-none font-mono font-medium transition-colors duration-500 ${todo.completed
                ? 'text-white/20'
                : isActive
                  ? 'text-black'
                  : 'text-[var(--accent1)]'
              }`}>
                <span className="relative top-px">{Number.isInteger(todo.duePercentage) ? todo.duePercentage : Math.round(todo.duePercentage)}%</span>
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

// ── SortableTodoItem ──────────────────────────────────────────────────────────

const SortableTodoItem: React.FC<SortableItemProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
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
    />
  );
};

// ── ListView ──────────────────────────────────────────────────────────────────

export const ListView: React.FC<ListViewProps> = ({
  todos,
  date,
  mode = 'compact',
  onToggle,
  onDelete,
  onSaveEdit,
  onCommitEdit,
  onOpenFull,
  onAddToCalendar,
  onStartTracking = () => {},
  activeTodoId = null,
  onAdd,
  countdownMode = 'off',
  collectionOptions = [],
  onCreateCollection,
  initialCollectionIdOf,
  onReorder,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const openAddPanel = () => { setEditingId(null); setIsAdding(true); };
  const openEditPanel = (id: string) => { setIsAdding(false); setEditingId(id); };

  const handleSaveEdit = (id: string, vals: QuickEditValues) => {
    onSaveEdit(id, vals);
    setEditingId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = todos.findIndex((t) => t && t.id === active.id);
      const newIndex = todos.findIndex((t) => t && t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(todos, oldIndex, newIndex));
      }
    }
  };

  const activeTodo = useMemo(
    () => todos.find((t) => t && t.id === activeId),
    [todos, activeId]
  );

  return (
    <div className="space-y-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={(todos || []).map((t) => t?.id).filter(Boolean) as string[]}
          strategy={verticalListSortingStrategy}
        >
          {(todos || []).map((todo) => {
            if (!todo || !todo.id) return null;
            return (
              <SortableTodoItem
                key={todo.id}
                todo={todo}
                date={date}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={(t) => openEditPanel(t.id)}
                isEditing={editingId === todo.id}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleSaveEdit}
                onCommitEdit={onCommitEdit}
                onOpenFull={onOpenFull}
                onAddToCalendar={onAddToCalendar || (() => {})}
                onStartTracking={onStartTracking}
                isActive={activeTodoId === todo.id}
                now={now}
                countdownMode={countdownMode}
                collectionOptions={collectionOptions}
                onCreateCollection={onCreateCollection || (() => '')}
                initialCollectionId={initialCollectionIdOf ? initialCollectionIdOf(todo) : null}
              />
            );
          })}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeId && activeTodo ? (
            <TodoItem
              todo={activeTodo}
              date={date}
              onToggle={() => {}}
              onDelete={() => {}}
              onEdit={() => {}}
              isEditing={false}
              onCancelEdit={() => {}}
              onSaveEdit={() => {}}
              onCommitEdit={() => {}}
              onOpenFull={() => {}}
              onStartTracking={() => {}}
              isActive={activeTodoId === activeTodo.id}
              now={now}
              countdownMode={countdownMode}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add todo */}
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
          initialDate={date}
          collectionOptions={collectionOptions}
          onCreateCollection={onCreateCollection}
          onSubmit={onAdd}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {todos.length === 0 && !isAdding && (
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-20">
          <CheckSquare className="w-12 h-12" />
          <p className="text-xs font-medium">Clear schedule for this day</p>
        </div>
      )}
    </div>
  );
};

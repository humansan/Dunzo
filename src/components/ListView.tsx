import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  GripVertical,
  Trash2,
  Circle,
  CheckSquare,
  Maximize2,
  CalendarPlus,
  Sparkles,
  Flag,
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
import { isDone } from '../utils/todoStatus';
import { pill } from '../theme/pill';
import { priorityOption } from './todoFields';
import { TaskTimeChips, formatCountdown } from './TaskTimeChips';
import { QuickEditTodo, QuickEditValues } from './QuickEditTodo';
import { DailyRowContextMenu } from './DailyRowContextMenu';

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
  onContextMenu?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
  style?: React.CSSProperties;
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
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
  onContextMenu?: (e: React.MouseEvent) => void;
  now: Date;
  countdownMode: 'off' | 'time' | 'percent';
  collectionOptions: CollectionOption[];
  onCreateCollection: (name: string) => string;
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
  /** Row context menu — copy a task in place, just below the original. */
  onDuplicate?: (id: string) => void;
  /** Row context menu — reschedule to another day (YYYY-MM-DD). */
  onSetDate?: (id: string, date: string) => void;
  /** Row context menu — set the due/end time ('' clears it). */
  onSetTime?: (id: string, time: string) => void;
  /** Row context menu — nest the task under another task (null = top level). */
  onSetParent?: (id: string, parentId: string | null) => void;
  /** Row context menu — insert a new task directly above/below `anchorId`. */
  onAddAt?: (vals: QuickEditValues, anchorId: string, pos: 'above' | 'below') => void;
  countdownMode?: 'off' | 'time' | 'percent';
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
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
  onContextMenu,
  isDragging,
  style,
  attributes,
  listeners,
  setNodeRef,
  now,
  countdownMode,
  collectionOptions = [],
  onCreateCollection,
}) => {
  const countdownDisplay = useMemo(
    () => formatCountdown(todo, date, now, countdownMode),
    [todo, date, now, countdownMode]
  );

  // Priority is shown as an icon-only square chip, tinted with the priority color.
  const prio = todo.priority ? priorityOption(todo.priority) : undefined;

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <QuickEditTodo
          mode="edit"
          todoId={todo.id}
          initialText={todo.text}
          initialNotes={todo.notes || ''}
          initialDate={date}
          initialStartTime={todo.startTime}
          initialTime={todo.dueTime}
          initialPercent={todo.duePercentage}
          initialXp={todo.xp}
          initialStatus={todo.status}
          initialPriority={todo.priority}
          initialParentId={todo.parentId}
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
      onContextMenu={onContextMenu}
      className={`relative group flex items-start gap-2 py-1.5 border-b border-line-subtle ${isDragging ? 'opacity-0' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-fg-faint hover:text-fg-muted transition-all flex items-center h-7"
      >
        <GripVertical size={18} />
      </button>

      <button
        onClick={() => onToggle(todo.id)}
        className="relative cursor-pointer h-7 flex items-center"
      >
        <motion.div
          animate={isDone(todo) ? { scale: [1.3, 1], rotate: [15, 0] } : {}}
          transition={{ duration: 0.3 }}
          className={`transition-colors duration-100 ${isDone(todo) ? 'text-(--accent1)' : 'text-fg-subtle hover:text-fg'}`}
        >
          {isDone(todo) ? <CheckCircleCutout size={21} strokeWidth={2.5} /> : <Circle size={21} strokeWidth={2.5} />}
        </motion.div>
      </button>

      <div className="flex items-start gap-1.5 min-w-0">
        <div className="min-w-0 cursor-default group/text" onClick={() => onEdit(todo)}>
          <p className={`text-md leading-6 pt-0.5 transition duration-200 ease-out font-medium break-words [overflow-wrap:anywhere] ${isDone(todo)
            ? 'text-fg-ghost line-through translate-x-[3px]'
            : 'text-fg group-hover/text:text-(--accent2)'
          }`}>
            {todo.text}
          </p>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onOpenFull(todo.id); }}
          title="Open full view"
          className="opacity-0 group-hover:opacity-100 p-1 h-7 flex items-center text-fg-subtle hover:text-fg-muted hover:bg-fill-subtle rounded-md transition-all shrink-0"
        >
          <Maximize2 size={14} />
        </button>

        {!todo.startTime && !todo.dueTime && onAddToCalendar && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToCalendar(todo.id); }}
            title="Add to calendar"
            className="opacity-0 group-hover:opacity-100 p-1 h-7 flex items-center text-fg-subtle hover:text-fg-muted hover:bg-fill-subtle rounded-md transition-all shrink-0"
          >
            <CalendarPlus size={14} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-start gap-1.5 shrink-0 whitespace-nowrap">
        {prio && (
          <div
            title={`${prio.label} priority`}
            style={isDone(todo) ? undefined : pill(prio.color)}
            className={`flex items-center justify-center p-[5.5px] rounded-lg ${isDone(todo) ? 'bg-fill-subtle text-fg-ghost' : ''}`}
          >
            <Flag size={16} />
          </div>
        )}

        {todo.xp !== undefined && (
          <div className={`flex items-center justify-center gap-1.5 px-2.75 py-[5.5px] rounded-lg text-[13px] leading-none font-mono font-medium ${isDone(todo)
            ? 'bg-fill-subtle text-fg-ghost'
            : 'bg-warning-tint text-warning'
          }`}>
            <Sparkles size={16} />
            <span className="relative top-px">{todo.xp} XP</span>
          </div>
        )}

        <TaskTimeChips
          todo={todo}
          countdown={countdownDisplay}
          done={isDone(todo)}
          onTimeClick={() => onStartTracking(todo.id)}
        />

        <button
          onClick={() => onDelete(todo.id)}
          className="opacity-0 group-hover:opacity-100 min-h-7 min-w-7 flex items-center justify-center text-fg-faint hover:text-red-400 hover:bg-danger-tint rounded-lg transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>

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
  onAdd,
  onDuplicate,
  onSetDate,
  onSetTime,
  onSetParent,
  onAddAt,
  countdownMode = 'off',
  collectionOptions = [],
  onCreateCollection,
  onReorder,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  // Right-click menu target (row id + cursor position).
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // "Add task above/below": an inline add panel anchored to a row. The task is
  // only created on submit, so cancelling leaves no empty row behind.
  const [insertAt, setInsertAt] = useState<{ anchorId: string; pos: 'above' | 'below' } | null>(null);
  // Buffer to keep the reordered IDs locally so that the list never flashes
  // the old order during the render tick before React Query catches up
  // (setTimeout(0) scheduling in notifyManager, see notifyManager.ts:63).
  const [reorderBuffer, setReorderBuffer] = useState<string[] | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Only one panel is ever open: opening any of them closes the others.
  const openAddPanel = () => { setEditingId(null); setInsertAt(null); setIsAdding(true); };
  const openEditPanel = (id: string) => { setIsAdding(false); setInsertAt(null); setEditingId(id); };
  const openInsertPanel = (anchorId: string, pos: 'above' | 'below') => {
    setIsAdding(false);
    setEditingId(null);
    setInsertAt({ anchorId, pos });
  };

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
        const reordered = arrayMove(todos, oldIndex, newIndex);
        setReorderBuffer(reordered.map((t) => t.id));
        onReorder(reordered);
      }
    }
  };

  // Derive the display order: use the local buffer (immediate reorder) until the
  // prop catches up (which may be a render cycle behind due to React Query's
  // setTimeout(0) scheduling), then fall through to the prop order.
  const visibleTodos = useMemo(() => {
    if (!reorderBuffer) return todos;
    const byId = new Map(todos.map((t) => [t.id, t]));
    return reorderBuffer.map((id) => byId.get(id)).filter(Boolean) as Todo[];
  }, [todos, reorderBuffer]);

  // When the prop order matches the buffer, the cache has caught up:
  // discard the local buffer so we render from the canonical source.
  useEffect(() => {
    if (!reorderBuffer) return;
    if (todos.length !== reorderBuffer.length) return;
    if (reorderBuffer.every((id, i) => todos[i]?.id === id)) {
      setReorderBuffer(null);
    }
  }, [todos]);

  const activeTodo = useMemo(
    () => todos.find((t) => t && t.id === activeId),
    [todos, activeId]
  );

  const menuTodo = useMemo(
    () => (menu ? todos.find((t) => t && t.id === menu.id) ?? null : null),
    [todos, menu]
  );

  const insertPanel = insertAt && onAddAt && (
    <QuickEditTodo
      mode="add"
      initialDate={date}
      collectionOptions={collectionOptions}
      onCreateCollection={onCreateCollection}
      onSubmit={(vals) => { onAddAt(vals, insertAt.anchorId, insertAt.pos); setInsertAt(null); }}
      onCancel={() => setInsertAt(null)}
    />
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
          items={(visibleTodos || []).map((t) => t?.id).filter(Boolean) as string[]}
          strategy={verticalListSortingStrategy}
        >
          {(visibleTodos || []).map((todo) => {
            if (!todo || !todo.id) return null;
            const anchored = insertAt?.anchorId === todo.id;
            return (
              <React.Fragment key={todo.id}>
                {anchored && insertAt!.pos === 'above' && insertPanel}
                <SortableTodoItem
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ id: todo.id, x: e.clientX, y: e.clientY });
                  }}
                  now={now}
                  countdownMode={countdownMode}
                  collectionOptions={collectionOptions}
                  onCreateCollection={onCreateCollection || (() => '')}
                />
                {anchored && insertAt!.pos === 'below' && insertPanel}
              </React.Fragment>
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
          className="flex items-center gap-2 py-2 text-fg-ghost hover:text-fg-subtle transition-all group duration-100"
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

      {menu && menuTodo && (
        <DailyRowContextMenu
          todo={menuTodo}
          date={date}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onOpenFull={onOpenFull}
          onDuplicate={(id) => onDuplicate?.(id)}
          onSetDate={(id, d) => onSetDate?.(id, d)}
          onSetTime={(id, t) => onSetTime?.(id, t)}
          onSetParent={(id, parentId) => onSetParent?.(id, parentId)}
          onAddAbove={(id) => openInsertPanel(id, 'above')}
          onAddBelow={(id) => openInsertPanel(id, 'below')}
          onDelete={onDelete}
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

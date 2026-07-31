import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Maximize2,
  Copy,
  CalendarDays,
  Clock,
  ArrowUp,
  ArrowDown,
  GitBranch,
  Trash2,
} from 'lucide-react';
import { Todo } from '@shared/types';
import { isDescendantOf } from '@/features/tasks/model';
import { CalendarInput } from '@/common/ui';
import { TimeInput } from '@/common/ui';
import { TaskFinder } from '@/features/planner/task-finder';
import { useAppData } from '@/lib/app-data';

// Right-click menu for a daily-list row - the counterpart to the Task Planner's
// RowContextMenu. Date / time open the same CalendarInput + TimeInput panels the
// quick-edit chips use, flown out beside the menu; "Set parent task" opens the
// shared TaskFinder picker. All mutations are callbacks so DailyList's parent owns
// the state.
const itemCls =
  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-muted hover:bg-fill hover:text-fg transition-colors';

const MARGIN = 8;
const PANEL_WIDTH = 240; // CalendarInput / TimeInput are w-60
const PANEL_HEIGHT = 420; // tall enough for the calendar; used for flip math only

export const DailyRowContextMenu: React.FC<{
  todo: Todo;
  /** The day the row is filed under - the daily list's due date. */
  date: string;
  x: number;
  y: number;
  onClose: () => void;
  onOpenFull: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSetDate: (id: string, date: string) => void;
  onSetTime: (id: string, time: string) => void;
  onAddAbove: (id: string) => void;
  onAddBelow: (id: string) => void;
  onSetParent: (id: string, parentId: string | null) => void;
  onDelete: (id: string) => void;
}> = ({
  todo,
  date,
  x,
  y,
  onClose,
  onOpenFull,
  onDuplicate,
  onSetDate,
  onSetTime,
  onAddAbove,
  onAddBelow,
  onSetParent,
  onDelete,
}) => {
  const { searchEntries, todoById, handleHubSaveTodo, handleToggleTodo } = useAppData();

  // Which flyout is open beside the menu, if any.
  const [sub, setSub] = useState<'date' | 'time' | null>(null);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Place at the cursor, flipping back over it when the menu would clip.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x;
    if (left + w > window.innerWidth - MARGIN) left = Math.max(MARGIN, x - w);
    let top = y;
    if (top + h > window.innerHeight - MARGIN) top = Math.max(MARGIN, y - h);
    setPos({ top, left });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Flyouts sit to the right of the menu unless that would run off-screen, and
  // hang from its top unless that would run off the bottom.
  const menuLeft = pos?.left ?? x;
  const menuTop = pos?.top ?? y;
  const menuWidth = menuRef.current?.offsetWidth ?? 190;
  const flipX = menuLeft + menuWidth + PANEL_WIDTH + MARGIN > window.innerWidth;
  const flipY = menuTop + PANEL_HEIGHT + MARGIN > window.innerHeight;

  // A task can't be nested under itself or one of its own descendants.
  const isDisabled = (id: string): boolean => {
    if (id === todo.id) return true;
    const candidate = todoById.get(id);
    return !!candidate && isDescendantOf(candidate, todo.id, todoById);
  };

  const toggleSub = (which: 'date' | 'time') => setSub((cur) => (cur === which ? null : which));

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[65]"
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        style={{ position: 'fixed', left: menuLeft, top: menuTop }}
        className="z-[66] min-w-[190px] rounded-lg border border-line bg-surface shadow-2xl p-1 text-sm"
      >
        <button onClick={() => { onOpenFull(todo.id); onClose(); }} className={itemCls}>
          <Maximize2 size={14} /> Show in full view
        </button>
        <button onClick={() => { onDuplicate(todo.id); onClose(); }} className={itemCls}>
          <Copy size={14} /> Duplicate
        </button>
        <button
          onClick={() => toggleSub('date')}
          className={`${itemCls} ${sub === 'date' ? 'bg-fill text-fg' : ''}`}
        >
          <CalendarDays size={14} /> Set date
        </button>
        <button
          onClick={() => date && toggleSub('time')}
          disabled={!date}
          title={date ? undefined : 'Add a date first'}
          className={`${itemCls} ${sub === 'time' ? 'bg-fill text-fg' : ''} ${date ? '' : 'opacity-40 cursor-not-allowed'}`}
        >
          <Clock size={14} /> Set time
        </button>
        <button onClick={() => { onAddAbove(todo.id); onClose(); }} className={itemCls}>
          <ArrowUp size={14} /> Add task above
        </button>
        <button onClick={() => { onAddBelow(todo.id); onClose(); }} className={itemCls}>
          <ArrowDown size={14} /> Add task below
        </button>
        <button onClick={() => setParentPickerOpen(true)} className={itemCls}>
          <GitBranch size={14} /> Set parent task
        </button>
        <button
          onClick={() => { onDelete(todo.id); onClose(); }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-red-400 hover:bg-danger-tint hover:text-red-300 transition-colors"
        >
          <Trash2 size={14} /> Delete
        </button>

        {sub && (
          <div
            className={`absolute ${flipX ? 'right-full mr-1' : 'left-full ml-1'} ${flipY ? 'bottom-0' : 'top-0'}`}
          >
            {sub === 'date' ? (
              <CalendarInput
                value={date}
                autoFocus
                // A daily-list-only task has nowhere to live once undated, so it
                // can't clear its date; one that's also in the planner can.
                showClear={!!todo.showInDatabase}
                onChange={(val) => onSetDate(todo.id, val)}
              />
            ) : (
              <TimeInput
                value={todo.dueTime}
                autoFocus
                onChange={(val) => onSetTime(todo.id, val)}
              />
            )}
          </div>
        )}
      </div>

      {parentPickerOpen && (
        <TaskFinder
          entries={searchEntries}
          todoById={todoById}
          onSaveTodo={handleHubSaveTodo}
          onToggleTodo={handleToggleTodo}
          title="Set parent task"
          placeholder="Search for a task to nest under…"
          isDisabled={isDisabled}
          rootOption={{
            label: 'Set no parent',
            onSelect: () => { onSetParent(todo.id, null); onClose(); },
          }}
          onPick={(id) => { onSetParent(todo.id, id); onClose(); }}
          onClose={() => setParentPickerOpen(false)}
        />
      )}
    </>,
    document.body
  );
};

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Maximize2,
  Copy,
  CalendarDays,
  Clock,
  ArrowUp,
  ArrowDown,
  CornerDownRight,
  FolderPlus,
  Palette,
  Pencil,
  GitBranch,
} from 'lucide-react';
import { OrganizerEntry } from '@/features/tasks/model';
import { CalendarInput } from '@/common/ui';
import { TimeInput } from '@/common/ui';
import { COLLECTION_SLOTS, collectionColor, collectionSlot, colorName } from '@/theme/collectionColor';
import { useAppData } from '@/lib/app-data';

// Right-click / 3-dot row menu. Branches on whether the target row is a
// collection (Edit / nested collection / recolor) or a task - the task items
// mirror the daily list's DailyRowContextMenu, in the same order, plus the
// planner-only "Create task inside" / "Make collection". Both share Archive +
// Delete. All actions are passed in as callbacks so the parent owns the state
// mutations and menu-closing.
const itemCls =
  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-muted hover:bg-fill hover:text-fg transition-colors';

const MARGIN = 8;
const PANEL_WIDTH = 240;  // CalendarInput / TimeInput are w-60
const PANEL_HEIGHT = 420; // tall enough for the calendar; used for flip math only

export const RowContextMenu: React.FC<{
  menu: { id: string; x: number; y: number, sidebar?: true };
  menuPos: { top: number; left: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  entry: OrganizerEntry | null;
  colorPickerOpen: boolean;
  onToggleColorPicker: () => void;
  onClose: () => void;
  onEditCollection: (id: string) => void;
  // The four create actions are omitted in views that don't offer creation (see
  // ViewDef.allowNew) - Archived above all, where a new child would be a LIVE todo
  // under an archived parent (the invariant in shared/domain/todoArchive now
  // archives it instead, so the row would silently vanish into the row it was
  // created under). An undefined handler renders no item, which keeps "can this
  // view create?" a single decision made by the caller rather than a `selectedView`
  // check duplicated in here.
  onCreateTaskInside?: (parentId: string, sidebar?: true) => void;
  onCreateNestedCollection?: (parentId: string, sidebar?: true) => void;
  onChangeColor: (entry: OrganizerEntry, color: string) => void;
  onMakeCollection: (entry: OrganizerEntry) => void;
  onMoveTo: (id: string) => void;
  onExpand: (id: string) => void;
  // Also a create action, so it's gated with the other four (Duplicate in Archived
  // would make a copy that inherits the archived state and vanishes into it).
  onDuplicate?: (id: string) => void;
  // Omitted for an archived row: scheduling something that has left every live
  // surface is meaningless - the date can't put it back on the daily list or in a
  // dated view, so the picker would write a field nothing reads. Restore the task
  // first. (Set time additionally needs a date, per the schedule invariant.)
  onSetDate?: (id: string, date: string) => void;
  onSetTime?: (id: string, time: string) => void;
  onAddTaskAbove?: (id: string) => void;
  onAddTaskBelow?: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({
  menu,
  menuPos,
  menuRef,
  entry,
  colorPickerOpen,
  onToggleColorPicker,
  onClose,
  onEditCollection,
  onCreateTaskInside,
  onCreateNestedCollection,
  onChangeColor,
  onMakeCollection,
  onMoveTo,
  onExpand,
  onDuplicate,
  onSetDate,
  onSetTime,
  onAddTaskAbove,
  onAddTaskBelow,
  onArchive,
  onDelete,
}) => {
  const { handleHubSaveTodo } = useAppData();

  // Which date/time flyout is open beside the menu, if any.
  const [sub, setSub] = useState<'date' | 'time' | null>(null);
  useEffect(() => { setSub(null); }, [menu.id]);

  const left = menuPos?.left ?? menu.x;
  const top = menuPos?.top ?? menu.y;
  // Flyouts sit to the right of the menu unless that would run off-screen, and
  // hang from its top unless that would run off the bottom.
  const menuWidth = menuRef.current?.offsetWidth ?? 190;
  const flipX = left + menuWidth + PANEL_WIDTH + MARGIN > window.innerWidth;
  const flipY = top + PANEL_HEIGHT + MARGIN > window.innerHeight;

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
        style={{ position: 'fixed', left, top }}
        className="z-[66] min-w-[190px] rounded-lg border border-line bg-surface shadow-2xl p-1 text-sm"
      >
        {entry?.todo.isCollection ? (
          <>
            <button onClick={() => onEditCollection(menu.id)} className={itemCls}>
              <Pencil size={14} /> Edit
            </button>
            {onCreateNestedCollection && (
              <button onClick={() => onCreateNestedCollection(menu.id, menu.sidebar)} className={itemCls}>
                <FolderPlus size={14} /> Create collection inside
              </button>
            )}
            {onCreateTaskInside && (
              <button onClick={() => onCreateTaskInside(menu.id, menu.sidebar)} className={itemCls}>
                <CornerDownRight size={14} /> Create task inside
              </button>
            )}
            <button onClick={onToggleColorPicker} className={itemCls}>
              <Palette size={14} /> Change color
            </button>
            {colorPickerOpen && (
              <div className="grid grid-cols-4 gap-1.5 px-2.5 py-2">
                {COLLECTION_SLOTS.map((slot) => {
                  const selected = collectionSlot(entry.todo.color) === slot;
                  return (
                    <button
                      key={slot}
                      title={colorName(slot)}
                      onClick={() => onChangeColor(entry, slot)}
                      className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                        selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'ring-1 ring-line-strong'
                      }`}
                      style={{ backgroundColor: collectionColor(slot) }}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onExpand(menu.id)} className={itemCls}>
              <Maximize2 size={14} /> Show in full view
            </button>
            {onCreateTaskInside && (
              <button onClick={() => onCreateTaskInside(menu.id)} className={itemCls}>
                <CornerDownRight size={14} /> Create task inside
              </button>
            )}
            {onSetDate && (
              <button
                onClick={() => toggleSub('date')}
                className={`${itemCls} ${sub === 'date' ? 'bg-fill text-fg' : ''}`}
              >
                <CalendarDays size={14} /> Set date
              </button>
            )}
            {onSetTime && entry?.todo.dueDate && (
              <button
                onClick={() => entry?.todo.dueDate && toggleSub('time')}
                disabled={!entry?.todo.dueDate}
                title={entry?.todo.dueDate ? undefined : 'Add a date first'}
                className={`${itemCls} ${sub === 'time' ? 'bg-fill text-fg' : ''} ${entry?.todo.dueDate ? '' : 'opacity-40 cursor-not-allowed'}`}
              >
                <Clock size={14} /> Set time
              </button>
            )}
            <button onClick={() => onMoveTo(menu.id)} className={itemCls}>
              <GitBranch size={14} /> Set parent task
            </button>
            {onDuplicate && (
              <button onClick={() => onDuplicate(menu.id)} className={itemCls}>
                <Copy size={14} /> Duplicate
              </button>
            )}
            {onAddTaskAbove && (
              <button onClick={() => onAddTaskAbove(menu.id)} className={itemCls}>
                <ArrowUp size={14} /> Add task above
              </button>
            )}
            {onAddTaskBelow && (
              <button onClick={() => onAddTaskBelow(menu.id)} className={itemCls}>
                <ArrowDown size={14} /> Add task below
              </button>
            )}
            {/* <button onClick={() => entry && onMakeCollection(entry)} className={itemCls}>
              <FolderPlus size={14} /> Make collection
            </button> */}
          </>
        )}
        <button onClick={() => onArchive(menu.id)} className={itemCls}>
          {entry?.todo.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {entry?.todo.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button
          onClick={() => onDelete(menu.id)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-red-400 hover:bg-danger-tint hover:text-red-300 transition-colors"
        >
          <Trash2 size={14} /> Delete
        </button>

        {sub && entry && (
          <div
            className={`absolute ${flipX ? 'right-full mr-1' : 'left-full ml-1'} ${flipY ? 'bottom-0' : 'top-0'}`}
          >
            {sub === 'date' ? (
              <CalendarInput
                value={entry.todo.dueDate ?? ''}
                autoFocus
                showInDailyList={entry.todo.showInDatabase !== false ? (entry.todo.showInDailyList ?? false) : undefined}
                onShowInDailyListChange={entry.todo.showInDatabase !== false ? ((val) => handleHubSaveTodo({ ...entry.todo, showInDailyList: val })) : undefined}
                autoMoveDate={entry.todo.autoMoveDate ?? false}
                onAutoMoveDateChange={(val) => handleHubSaveTodo({ ...entry.todo, autoMoveDate: val })}
                onChange={(val) => onSetDate?.(menu.id, val)}
              />
            ) : (
              <TimeInput
                value={entry.todo.dueTime}
                autoFocus
                onChange={(val) => onSetTime?.(menu.id, val)}
              />
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

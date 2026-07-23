import React from 'react';
import { createPortal } from 'react-dom';
import { Todo } from '@shared/types';
import { OrganizerEntry, CollectionOption, collectionOf, reconcileSchedule } from '@/features/tasks/model';
import {
  NotesField,
  OptionSelectField,
  patchFromTime,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from '@/features/tasks/fields';
import { CalendarInput } from '@/common/ui';
import { TimeInput } from '@/common/ui';
import { XpSlider } from '@/common/ui';
import { CollectionPicker, COLLECTION_PANEL_WIDTH } from '@/features/tasks/collection-picker';
import { EditState } from '@/features/planner/types';

// The portaled inline-cell editor: a popover anchored to the cell being edited
// that swaps in the right control for the column (status/priority chips, a
// collection picker, date/time inputs, or a notes textarea). Escapes the table's
// scroll container via a body portal.
export const CellEditorPopover: React.FC<{
  editing: NonNullable<EditState>;
  entry: OrganizerEntry;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  popoverPos: { top: number; left: number } | null;
  collectionOptions: CollectionOption[];
  todoById: Map<string, Todo>;
  onSaveTodo: (updatedTodo: Todo) => void;
  onSetTaskCollection: (taskId: string, collectionId: string | null) => void;
  onCreateCollection: (name: string) => string;
  onClose: () => void;
}> = ({
  editing,
  entry,
  popoverRef,
  popoverPos,
  collectionOptions,
  todoById,
  onSaveTodo,
  onSetTaskCollection,
  onCreateCollection,
  onClose,
}) => {
  if (!editing.rect) return null;
  const { col } = editing;
  const isDateOrTime = col === 'date' || col === 'startDate' || col === 'start' || col === 'end';
  // Panels that supply their own popover shell (bg/border/padding); the wrapper
  // stays chrome-less for these and just positions/sizes them.
  const isPanel = isDateOrTime || col === 'xp' || col === 'collection';
  const save = (patch: Partial<Todo>) => onSaveTodo({ ...entry.todo, ...patch });
  // A date/time edit must keep the schedule invariant (a time needs its date; start
  // can't be after due). `side` names the side being edited so an ordering conflict
  // moves the other one.
  const saveSchedule = (patch: Partial<Todo>, side: 'start' | 'due') =>
    onSaveTodo(reconcileSchedule({ ...entry.todo, ...patch }, side));
  // A time column can't be edited until its side has a date.
  const noDateNotice = (label: string) => (
    <div className="rounded-lg border border-line bg-surface shadow-2xl px-3 py-2 text-xs text-fg-subtle">
      Add a {label} first
    </div>
  );

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: popoverPos?.left ?? editing.rect.left,
        top: popoverPos?.top ?? editing.rect.bottom + 4,
        width: isPanel
          ? (col === 'collection' ? COLLECTION_PANEL_WIDTH : 240)
          : Math.max(editing.rect.width, col === 'status' || col === 'priority' ? 180 : 260),
      }}
      className={
        isPanel
          ? 'z-[65] shadow-2xl'
          : 'z-[65] rounded-lg border border-line bg-surface shadow-2xl p-2'
      }
    >
      {col === 'status' || col === 'priority' ? (
        <OptionSelectField
          options={col === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS}
          value={col === 'status' ? entry.todo.status : entry.todo.priority}
          onChange={(val) => {
            // Completion is derived from status; the save path stamps completedAt.
            save({ [col]: val || undefined });
            onClose();
          }}
        />
      ) : col === 'collection' ? (
        <CollectionPicker
          value={collectionOf(entry.todo, todoById)}
          options={collectionOptions}
          onChange={(id) => { onSetTaskCollection(entry.todo.id, id); onClose(); }}
          onCreate={onCreateCollection}
        />
      ) : col === 'xp' ? (
        <XpSlider
          value={entry.todo.xp}
          autoFocus
          onChange={(val) => save({ xp: val })}
        />
      ) : col === 'date' ? (
        <CalendarInput
          value={entry.todo.dueDate || ''}
          autoFocus
          showInDailyList={entry.todo.showInDailyList ?? false}
          onShowInDailyListChange={(val) => save({ showInDailyList: val })}
          onChange={(val) => {
            // Clearing the date keeps the showInDailyList flag - an undated task
            // just never lands on a daily list, and re-adding a date sends it back.
            // reconcileSchedule also drops the due time when the date goes away.
            saveSchedule({ dueDate: val || undefined }, 'due');
          }}
        />
      ) : col === 'startDate' ? (
        <CalendarInput
          value={entry.todo.startDate || ''}
          autoFocus
          onChange={(val) => saveSchedule({ startDate: val || undefined }, 'start')}
        />
      ) : col === 'start' ? (
        entry.todo.startDate ? (
          <TimeInput
            value={entry.todo.startTime}
            autoFocus
            onChange={(val) => saveSchedule(patchFromTime('start', val), 'start')}
          />
        ) : (
          noDateNotice('start date')
        )
      ) : col === 'end' ? (
        entry.todo.dueDate ? (
          <TimeInput
            value={entry.todo.dueTime}
            autoFocus
            onChange={(val) => saveSchedule(patchFromTime('due', val), 'due')}
          />
        ) : (
          noDateNotice('due date')
        )
      ) : (
        <NotesField
          value={entry.todo.notes || ''}
          autoFocus
          minHeight={60}
          maxHeight={220}
          onChange={(val) => save({ notes: val || undefined })}
          className="w-full bg-transparent text-sm text-fg placeholder:text-fg-ghost focus:outline-none resize-none leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full"
        />
      )}
    </div>,
    document.body
  );
};

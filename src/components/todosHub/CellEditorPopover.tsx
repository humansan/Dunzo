import React from 'react';
import { createPortal } from 'react-dom';
import { Todo } from '../../types';
import { OrganizerEntry, CollectionOption, collectionOf } from '../../utils/todoFilters';
import {
  NotesField,
  CollectionSearchField,
  OptionSelectField,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from '../todoFields';
import { CalendarInput } from '../CalendarInput';
import { TimeInput } from '../TimeInput';
import { timeToPercentage } from '../../utils/timeUtils';
import { EditState } from './types';

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
  collPathFor: (todo: Todo) => { id: string; name: string; color?: string }[];
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
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
  collPathFor,
  onSaveTodo,
  onSetTaskCollection,
  onCreateCollection,
  onClose,
}) => {
  if (!editing.rect) return null;
  const { col } = editing;
  const isDateOrTime = col === 'date' || col === 'startDate' || col === 'start' || col === 'end';
  const save = (patch: Partial<Todo>) => onSaveTodo(entry.date, entry.date, { ...entry.todo, ...patch });

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: popoverPos?.left ?? editing.rect.left,
        top: popoverPos?.top ?? editing.rect.bottom + 4,
        width: isDateOrTime
          ? 240
          : Math.max(editing.rect.width, col === 'status' || col === 'priority' ? 180 : 260),
      }}
      className={
        isDateOrTime
          ? 'z-[58] shadow-2xl'
          : 'z-[58] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-2'
      }
    >
      {col === 'status' || col === 'priority' ? (
        <OptionSelectField
          options={col === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS}
          value={col === 'status' ? entry.todo.status : entry.todo.priority}
          onChange={(val) => {
            save({
              [col]: val || undefined,
              // Status drives the checkbox: Completed ⇒ checked, anything else ⇒ unchecked.
              ...(col === 'status' ? { completed: val === 'completed' } : {}),
            });
            onClose();
          }}
        />
      ) : col === 'collection' ? (
        <CollectionSearchField
          value={collectionOf(entry.todo, todoById)}
          currentPath={collPathFor(entry.todo)}
          options={collectionOptions}
          onChange={(id) => { onSetTaskCollection(entry.todo.id, id); onClose(); }}
          onCreate={onCreateCollection}
          autoFocus
        />
      ) : col === 'date' ? (
        <CalendarInput
          value={entry.date || ''}
          autoFocus
          showInDailyList={entry.todo.showInDailyList ?? false}
          onShowInDailyListChange={(val) => save({ showInDailyList: val })}
          onChange={(val) => {
            const updatedTodo = !val
              ? { ...entry.todo, showInDailyList: false }
              : entry.todo;
            onSaveTodo(entry.date, val || null, updatedTodo);
          }}
        />
      ) : col === 'startDate' ? (
        <CalendarInput
          value={entry.todo.startDate || ''}
          autoFocus
          onChange={(val) => save({ startDate: val || undefined })}
        />
      ) : col === 'start' ? (
        <TimeInput
          value={entry.todo.startTime}
          autoFocus
          onChange={(val) => save({ startTime: val || undefined })}
        />
      ) : col === 'end' ? (
        <TimeInput
          value={entry.todo.dueTime}
          autoFocus
          onChange={(val) => {
            // Keep duePercentage in sync with the end time (mirrors EndTimeField).
            const p = timeToPercentage(val);
            save({ dueTime: val || undefined, ...(p !== undefined ? { duePercentage: p } : {}) });
          }}
        />
      ) : (
        <NotesField
          value={entry.todo.notes || ''}
          autoFocus
          minHeight={60}
          maxHeight={220}
          onChange={(val) => save({ notes: val || undefined })}
          className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
        />
      )}
    </div>,
    document.body
  );
};

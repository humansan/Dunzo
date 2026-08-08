import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Todo } from '@shared/types';
import { OrganizerEntry, CollectionOption, collectionOf, normalizeScheduleTimes, isScheduleValid, earnsXp, hasDate } from '@/features/tasks/model';
import {
  NotesField,
  OptionSelectField,
  patchFromTime,
  xpDisabledReason,
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
  // Set when a schedule edit is rejected for putting start after due. Declared
  // before the early return below so the hook order stays stable.
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  if (!editing.rect) return null;
  const { col } = editing;
  const isDateOrTime = col === 'date' || col === 'startDate' || col === 'start' || col === 'end';
  // Panels that supply their own popover shell (bg/border/padding); the wrapper
  // stays chrome-less for these and just positions/sizes them.
  const isPanel = isDateOrTime || col === 'xp' || col === 'collection';
  const save = (patch: Partial<Todo>) => onSaveTodo({ ...entry.todo, ...patch });
  // A date/time edit must keep the schedule invariant. An orphan time still drops
  // automatically (a time needs its date), but an edit that would put start after
  // due is DISCARDED rather than nudging the side the user didn't touch. `side`
  // only words the notice.
  const saveSchedule = (patch: Partial<Todo>, side: 'start' | 'due') => {
    const candidate = normalizeScheduleTimes({ ...entry.todo, ...patch });
    if (!isScheduleValid(candidate)) {
      setScheduleError(side === 'start' ? "Start can't be after due" : "Due can't be before start");
      return;
    }
    setScheduleError(null);
    onSaveTodo(candidate);
  };
  // Stands in for an editor the task doesn't qualify for yet - a time column with
  // no date on its side, or XP on a task that isn't on a daily list. The cell still
  // opens, so the reason is visible where the control would have been.
  const notice = (text: string) => (
    <div className="rounded-lg border border-line bg-surface shadow-2xl px-3 py-2 text-xs text-fg-subtle">
      {text}
    </div>
  );
  const noDateNotice = (label: string) => notice(`Add a ${label} first`);

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
        // Gated the way the time columns are gated on their date: XP is only ever
        // earned on a daily list, so off one it would be a number nothing reads.
        earnsXp(entry.todo) ? (
          <XpSlider
            value={entry.todo.xp}
            autoFocus
            onChange={(val) => save({ xp: val })}
          />
        ) : (
          notice(
            xpDisabledReason(hasDate(entry.todo.dueDate ?? ''), entry.todo.showInDailyList === true)!
          )
        )
      ) : col === 'date' ? (
        <CalendarInput
          value={entry.todo.dueDate || ''}
          autoFocus
          showInDailyList={entry.todo.showInDatabase !== false ? (entry.todo.showInDailyList ?? false) : undefined}
          onShowInDailyListChange={entry.todo.showInDatabase !== false ? ((val) => save({ showInDailyList: val })) : undefined}
          autoMoveDate={entry.todo.autoMoveDate ?? false}
          onAutoMoveDateChange={(val) => save({ autoMoveDate: val })}
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
      {scheduleError && (
        <div className="mt-1.5 rounded-lg border border-line bg-surface shadow-2xl px-3 py-2 text-xs text-danger">
          {scheduleError}
        </div>
      )}
    </div>,
    document.body
  );
};

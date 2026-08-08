import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import {
  X,
  CornerLeftUp,
  Trash2,
  CalendarDays,
  Clock,
  Astroid,
  CircleDot,
  Flag,
  Archive,
  Database,
} from 'lucide-react';
import { Todo } from '@shared/types';
import { btnGhost, btnNeutral } from '@/theme/buttons';
import { Switch } from '@/common/ui';
import { useDismissable } from '@/common/ui/useDismissable';
import { CollectionOption, hasDate, normalizeScheduleTimes, isScheduleValid, type ScheduleSide } from '@/features/tasks/model';
import { isDone, collectWithDescendants, isDescendantOf } from '@/features/tasks/model';
import {
  TaskTable,
  buildTreeModel,
  useRowDnD,
  VARIANTS,
  DEFAULT_SECTIONS_CONFIG,
  NAME_COL_KEY,
  type TableInteraction,
  type TableRowHandlers,
  type EditState,
} from '@/features/planner/table';
import { useArchiveConfirm } from '@/features/tasks/useArchiveConfirm';
import { usePlannerVisibilityConfirm } from '@/features/tasks/usePlannerVisibilityConfirm';
import {
  CompletedToggle,
  OptionSelectField,
  patchFromTime,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from '@/features/tasks/fields';
import {
  DateChip,
  TimeChip,
  XpChip,
  ParentTaskButton,
  derivedCollectionId,
} from '@/features/tasks/chips';
import { CollectionPickerButton } from '@/features/tasks/collection-picker';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';

interface TodoFullViewProps {
  todo: Todo;
  date: string; // YYYY-MM-DD the todo currently lives on
  collectionOptions: CollectionOption[];
  onCreateCollection: (name: string) => string;
  byId: Map<string, Todo>;
  onClose: () => void;
  // Where Delete returns to: set only when this task was opened from another
  // task's full view, and unlike `onClose` (which rewinds the whole task chain)
  // it steps back a single history entry, so removing a subtask lands you back on
  // the view you came from rather than out of the chain entirely.
  //
  // This is the one thing here that is genuinely about HISTORY. The header's
  // parent button used to share it and no longer does - where you came from and
  // what a task sits under are different questions, and answering the second with
  // the first is what left the button missing on a subtask opened from anywhere
  // but its parent.
  onDeleteReturn?: () => void;
  onSave: (updated: Todo, newDate: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  // Archive/unarchive are subtree operations, so they go through the app-data
  // handlers rather than a plain `archived` edit - a single-row write here used to
  // leave live children under an archived parent (shared/domain/todoArchive).
  onArchive: (id: string) => void;
  onUnarchive: (id: string, mode: 'self' | 'subtree') => void;
  // Task Planner visibility is a subtree operation for the same reason archive is
  // - a visible task may not sit under a hidden one - so it goes through app data
  // rather than a plain `showInDatabase` edit on the draft.
  onHidePlanner: (id: string) => void;
  onShowPlanner: (id: string, mode: 'self' | 'subtree') => void;
  // ── Subtasks section ────────────────────────────────────────────────────────
  // Writes for the SUBTASK rows, which never touch this view's draft: they're
  // other tasks, saved straight through the shared handler like a planner row.
  onSaveTodo: (todo: Todo) => void;
  // Swap the overlay to another task (clicking a subtask row opens it here).
  onOpenTask: (id: string) => void;
  // "+ New" under the list: create a subtask and return its id, so the row can
  // drop straight into its title editor.
  onAddSubtask: (parentId: string) => string;
  // Persist the subtask order after a drag (position = hubOrder, parentId = nesting).
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  showXpChips: boolean; // hide the XP property when the settings toggle is off
}

// Vertical property block for the right pane: label row on top, control below.
const RightProp: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  noDivider?: boolean;
  onClear?: () => void;
  canClear?: boolean;
}> = ({ icon, label, children, noDivider, onClear, canClear }) => (
  <div className={`group/prop py-2.5 ${noDivider ? '' : 'border-b border-line-subtle'}`}>
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium h-5">
        {icon}
        {label}
      </div>
      {onClear && canClear && (
        <button
          type="button"
          onClick={onClear}
          title="Clear"
          className={`p-1 rounded text-fg-ghost hover:text-fg-subtle opacity-0 group-hover/prop:opacity-100 transition-all ${btnGhost()}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
    {children}
  </div>
);


function ensureCaretInView(el: HTMLTextAreaElement) {
  const container = el.closest<HTMLDivElement>('.overflow-y-auto');
  if (!container) return;

  const start = el.selectionStart ?? 0;
  const val = el.value;

  const computed = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.fontFamily = computed.fontFamily;
  mirror.style.fontSize = computed.fontSize;
  mirror.style.lineHeight = computed.lineHeight;
  mirror.style.padding = computed.padding;
  mirror.style.width = `${el.clientWidth}px`;
  mirror.style.boxSizing = computed.boxSizing;

  const textBefore = val.slice(0, start);
  const textBeforeNode = document.createTextNode(textBefore);
  const span = document.createElement('span');
  span.textContent = val.slice(start, start + 1) || '|';

  mirror.appendChild(textBeforeNode);
  mirror.appendChild(span);
  document.body.appendChild(mirror);

  const caretTopInEl = span.offsetTop;
  const lineHeight = span.offsetHeight || parseFloat(computed.lineHeight) || 20;
  const caretBottomInEl = caretTopInEl + lineHeight;

  document.body.removeChild(mirror);

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const elTopInContainer = elRect.top - containerRect.top + container.scrollTop;

  const caretTopInContainer = elTopInContainer + caretTopInEl;
  const caretBottomInContainer = elTopInContainer + caretBottomInEl;

  const visibleTop = container.scrollTop;
  const visibleBottom = container.scrollTop + container.clientHeight;
  const padding = 16;

  if (caretTopInContainer < visibleTop) {
    container.scrollTop = Math.max(0, caretTopInContainer - padding);
  } else if (caretBottomInContainer > visibleBottom) {
    container.scrollTop = caretBottomInContainer - container.clientHeight + padding;
  }
}

export const TodoFullView: React.FC<TodoFullViewProps> = ({
  todo,
  date,
  collectionOptions,
  onCreateCollection,
  byId,
  onClose,
  onDeleteReturn,
  onSave,
  onToggle,
  onDelete,
  onArchive,
  onUnarchive,
  onHidePlanner,
  onShowPlanner,
  onSaveTodo,
  onOpenTask,
  onAddSubtask,
  onReorder,
  showXpChips,
}) => {
  // The archive confirmation counts rows across the whole tree, not just this task.
  const allTodos = useMemo(() => [...byId.values()], [byId]);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [draft, setDraft] = useState<Todo>(todo);
  const [dateStr, setDateStr] = useState(date);

  const resizeTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Grow to fit content with no upper cap - the pane scrolls instead of capping the textarea.
  const resizeNotes = () => {
    const el = notesRef.current;
    if (!el) return;
    const parent = el.closest<HTMLDivElement>('.overflow-y-auto');
    const savedScroll = parent?.scrollTop;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (parent && savedScroll !== undefined) {
      parent.scrollTop = savedScroll;
    }
  };

  const handleNotesCaretScroll = () => {
    const el = notesRef.current;
    if (!el) return;
    ensureCaretInView(el);
  };

  useLayoutEffect(resizeTitle, [draft.text, todo.id]);
  useLayoutEffect(resizeNotes, [draft.notes, todo.id]);

  // Set when a schedule edit is rejected for putting start after due; shown under
  // the offending side's chips and cleared by the next accepted schedule edit.
  const [scheduleError, setScheduleError] = useState<{ side: ScheduleSide; message: string } | null>(null);

  useEffect(() => {
    setDraft(todo);
    setDateStr(date);
    setScheduleError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  // A task opened with no name is a task that was just created, so put the caret
  // straight in the title - the view is only ever "new" while the name is empty,
  // and switching tasks re-checks it (keyed on todo.id, not on every keystroke).
  useEffect(() => {
    if (todo.text.trim() !== '') return;
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  // Completion is stamped outside the draft - the checkbox toggles through app data,
  // and the save handlers derive completedAt from status - so both fields have to
  // come back from the prop or the Completed timestamp never appears. `archived` is
  // the same kind of field (the Archive button writes the whole subtree through
  // app data, not the draft) and the view now stays open across that write, so it
  // has to come back too: otherwise the button keeps saying "Archive" and the next
  // property edit would save a stale `archived: false` straight back over it.
  // `showInDatabase` is now in the same category, for the same reason - the Task
  // Planner switch writes a whole subtree through app data rather than the draft.
  useEffect(() => {
    setDraft(prev =>
      prev.status === todo.status &&
      prev.completedAt === todo.completedAt &&
      prev.archived === todo.archived &&
      prev.showInDatabase === todo.showInDatabase
        ? prev
        : {
            ...prev,
            status: todo.status,
            completedAt: todo.completedAt,
            archived: todo.archived,
            showInDatabase: todo.showInDatabase,
          }
    );
  }, [todo.status, todo.completedAt, todo.archived, todo.showInDatabase]);

  // Escape + backdrop click + scroll lock, shared with every other popup window.
  // This view keeps its own panel markup (hence the hook rather than OverlayShell);
  // `onClose` is the router-aware close from TaskOverlay, which pops the whole
  // task chain rather than one history entry.
  const { backdropProps } = useDismissable({ onDismiss: onClose });

  // ── Subtasks ────────────────────────────────────────────────────────────────
  // The whole descendant subtree, rendered through the planner's own table so the
  // rows behave identically (rename in place, check to complete, expand/collapse,
  // drag to reorder/nest).
  //
  // The open task itself is deliberately NOT in the entry set: flattenTree links a
  // node only to a parent that is present, so leaving it out is what makes its
  // direct children the top level of this list instead of everything hanging one
  // indent deeper under a row you're already looking at.
  //
  // Archived state is MIRRORED from the task being viewed rather than filtered out
  // flat. Under a live parent, an individually archived subtask is hidden - that's
  // an ordinary state and it belongs in the archived view, not here. But the
  // archive invariant makes every descendant of an archived task archived too
  // (shared/domain/todoArchive), so an unconditional `archived !== true` emptied
  // the list completely for an archived task - and silently swallowed anything
  // added to it, since a task created inside an archived parent is archived on
  // creation. Mirroring the parent means each list shows the subtasks that
  // actually live at its own level.
  const showArchivedSubtasks = todo.archived === true;
  const subtaskEntries = useMemo(() => {
    const ids = collectWithDescendants(allTodos, todo.id);
    ids.delete(todo.id);
    return [...ids]
      .map((id) => byId.get(id))
      .filter((t): t is Todo => !!t && (t.archived === true) === showArchivedSubtasks)
      .sort((a, b) => (a.hubOrder ?? a.createdAt) - (b.hubOrder ?? b.createdAt))
      .map((t) => ({ todo: t }));
  }, [allTodos, byId, todo.id, showArchivedSubtasks]);

  // Collapse + inline-edit state are LOCAL: the planner's own collapse set is
  // DB-synced and shared across its views, and a modal shouldn't reach into it.
  const [subCollapsed, setSubCollapsed] = useState<Set<string>>(new Set());
  const [subEditing, setSubEditing] = useState<EditState>(null);
  useEffect(() => { setSubCollapsed(new Set()); setSubEditing(null); }, [todo.id]);

  const subModel = useMemo(
    () => buildTreeModel(subtaskEntries, byId, { collapsed: subCollapsed }),
    [subtaskEntries, byId, subCollapsed]
  );
  const subById = useMemo(
    () => new Map(subtaskEntries.map((e) => [e.todo.id, e])),
    [subtaskEntries]
  );
  const subFlatById = useMemo(
    () => new Map(subModel.flattened.map((n) => [n.id, n])),
    [subModel.flattened]
  );

  const subDnd = useRowDnD({
    entries: subtaskEntries,
    processedEntries: subtaskEntries,
    flattened: subModel.flattened,
    flatById: subFlatById,
    groupedRows: [],
    byId: subById,
    isDescendantOf: (e, cid) => isDescendantOf(e.todo, cid, byId),
    // Re-anchor point for rows that read as top-level here. This is the trap: the
    // open task is absent from the set, so its direct children flatten to
    // parentId null, and a drop commit would reparent every one of them to the
    // root of the tree - silently emptying this list. Naming it here puts them
    // back under the task they belong to, exactly as a collection view does.
    selectedCollectionId: todo.id,
    sectionsConfig: DEFAULT_SECTIONS_CONFIG,
    onReorder,
    onSaveTodo,
    clearInteraction: () => setSubEditing(null),
  });

  const subInteraction = useMemo<TableInteraction>(() => ({
    editing: subEditing,
    startEdit: (id, col) => setSubEditing({ id, col, rect: null }),
    stopEdit: () => setSubEditing(null),
    // openMenu omitted - no RowContextMenu in this modal, so no ⋯ button.
    toggleCollapse: (id) =>
      setSubCollapsed((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
  }), [subEditing]);

  const subRowHandlers = useMemo<TableRowHandlers>(() => ({
    onSaveTodo,
    onToggleTodo: onToggle,
    onOpenTask,
    // "+ New" adds a subtask of the task being viewed and opens its title editor.
    // It seeds nothing of its own - and unlike the Planner's create surfaces it has
    // nothing to seed, since this list is not a view: no tab predicate, no filters,
    // no sections. What the new subtask does get is its parent's two surface flags
    // (see addHubTodo), so a subtask of a daily-only task is daily-only too rather
    // than being pulled into the Planner by a setting about Planner-created tasks.
    // Undated, it shows on neither surface and lives right here inside its parent,
    // which normalizeVisibility counts as a surface for exactly this case.
    //
    // Omitted on an ARCHIVED task, which drops the add-row entirely (TableRows
    // renders it only when this is supplied): anything created inside an archived
    // parent is archived on creation, so the button could only ever add rows to a
    // subtree that is on its way out. Restore the task to add to it.
    onNewInView: showArchivedSubtasks
      ? undefined
      : () => {
          const id = onAddSubtask(todo.id);
          setSubEditing({ id, col: NAME_COL_KEY, rect: null });
        },
  }), [onSaveTodo, onToggle, onAddSubtask, onOpenTask, todo.id, showArchivedSubtasks]);

  const update = (patch: Partial<Todo>, nextDate: string = dateStr) => {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      onSave(next, nextDate);
      return next;
    });
  };

  // Apply a schedule-affecting change (a start/due date or time). A time can't
  // exist without its date, so orphan times are still dropped automatically - but
  // an edit that would put start after due is DISCARDED rather than reconciled, so
  // the side the user didn't touch never moves under them. `editedSide` names the
  // side just touched, purely to word the rejection notice. The due date lives in
  // `dateStr` (onSave treats its second arg as authoritative for dueDate), so we
  // bake it into the candidate and read it back out.
  const updateSchedule = (
    patch: Partial<Todo>,
    editedSide: ScheduleSide,
    nextDueDate: string = dateStr,
  ) => {
    const candidate = normalizeScheduleTimes({
      ...draft,
      ...patch,
      dueDate: nextDueDate || undefined,
    });

    if (!isScheduleValid(candidate)) {
      // Ignore the edit outright. The chips are driven by draft/dateStr, which
      // haven't moved, so the picker visibly snaps back to the previous value.
      setScheduleError({
        side: editedSide,
        message: editedSide === 'start' ? "Start can't be after due" : "Due can't be before start",
      });
      return;
    }

    setScheduleError(null);
    const outDate = candidate.dueDate ?? '';
    setDateStr(outDate);
    setDraft(candidate);
    onSave(candidate, outDate);
  };

  // Whether this task hangs under another TASK (not a collection), which decides
  // how much of the reachability rule applies to it - see the "Show in" block below.
  const parentTodo = draft.parentId ? byId.get(draft.parentId) : undefined;
  const isSubtask = !!parentTodo && !parentTodo.isCollection;

  const handleDateChange = (val: string) => {
    // Clearing the due date drops the due time with it (a time needs its date -
    // reconcileSchedule strips it) and keeps the task reachable in the Planner
    // (mirrors normalizeVisibility); re-adding a date later sends it straight back.
    // A SUBTASK is exempt: it's reachable inside its parent task, and forcing it
    // into the Planner here would break the parent/child rule the moment the parent
    // is hidden - the write boundary would just hide it again on the next save.
    updateSchedule(val || isSubtask ? {} : { showInDatabase: true }, 'due', val);
  };

  // The time is the whole value (its % readout is derived), so these just write it.
  const handleStartTimeChange = (val: string) => updateSchedule(patchFromTime('start', val), 'start');
  const handleDueTimeChange = (val: string) => updateSchedule(patchFromTime('due', val), 'due');
  const handleStartDateChange = (val: string) => updateSchedule({ startDate: val || undefined }, 'start');

  // "Show in" invariants: the daily flag can be set even without a date (it just
  // stays pending until one is added), but the task must stay REACHABLE - so a
  // switch that is the sole *effective* surface can't be turned off. A daily-flagged
  // task only counts as reachable there once it has a date.
  //
  // A subtask is exempt from both locks: it is reachable inside its parent task's
  // full view (this very list), so it may be switched off everywhere - which is
  // what lets a hidden parent take its whole subtree out of the Planner. A parent
  // COLLECTION doesn't count: the Planner renders only the visible todos inside
  // one, so a task filed straight under a collection is a root for this purpose
  // and keeps the locks. See shared/domain/todoVisibility.
  const dated = hasDate(dateStr);
  const plannerOn = draft.showInDatabase === true;
  const dailyFlag = draft.showInDailyList === true;
  const dailyEffective = dailyFlag && dated; // actually reaches a daily list
  const autoMove = draft.autoMoveDate === true;
  const plannerDisabled = plannerOn && !dailyEffective && !isSubtask;
  const dailyDisabled = dailyEffective && !plannerOn && !isSubtask;

  // Planner visibility reaches past this task in both directions (hiding takes the
  // subtree down, showing lifts the hidden parents), so it asks first - same three
  // questions as the archive confirmation, and the modal renders alongside it at
  // the end of this component. The batch write goes through app data, not this
  // view's draft: the rows it touches are other tasks.
  const { requestPlannerVisibility, plannerVisibilityConfirmModal } = usePlannerVisibilityConfirm({
    todos: allTodos,
    onHide: onHidePlanner,
    onShow: onShowPlanner,
  });

  // Prompts when the operation reaches beyond this task; the modal is rendered at
  // the end of this component. Neither direction closes the view: `byId` indexes
  // every todo, archived included, so the task is still here to look at (and to
  // unarchive again) right after the write.
  const { requestArchiveToggle, archiveConfirmModal } = useArchiveConfirm({
    todos: allTodos,
    onArchive,
    onUnarchive,
  });
  const handleArchive = () => requestArchiveToggle(draft.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      {...backdropProps}
      className={`fixed inset-0 z-[70] p-16 flex items-center justify-center ${overlayBackdrop}`}
    >
      <motion.div
        {...modalPop}
        className="w-250 h-full max-h-250 bg-surface border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* ── Top bar ─────────────────────────────── */}
        <div className="flex items-center justify-between pl-4 pr-2 h-11 border-b border-line-subtle shrink-0">
          <div className="flex items-center gap-2 text-fg-faint text-xs font-semibold">
            <CalendarDays size={14} />
            {dateStr ? format(parseISO(dateStr), 'EEE, MMM d') : 'No date'}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className={`p-1.5 rounded-lg transition-all ${btnGhost()}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Two-pane body ────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left pane: title + notes */}
          <div className="flex-1 flex flex-col overflow-y-auto min-w-0 px-8 py-6">
            {/* The task this one sits under - a way UP the tree, not a history
                step. It used to be the latter, which meant it appeared only for a
                subtask opened from its parent's own full view: the identical task
                reached from the planner, the daily list or a deep link showed
                nothing, though its parent was no less real. Reading it off
                `parentId` makes the header say the same thing however you got here.

                A parent COLLECTION is deliberately excluded (`isSubtask`): this
                overlay renders a task, and a collection has no full view to open.
                Its collection is already named in the right pane. */}
            {isSubtask && parentTodo && (
              <button
                type="button"
                onClick={() => onOpenTask(parentTodo.id)}
                title={`Open parent task “${parentTodo.text.trim() || 'Untitled'}”`}
                className={`self-start max-w-full mb-3 flex items-center gap-1.5 pl-2 pr-3 py-1 rounded-full text-xs font-medium ${btnNeutral}`}
              >
                <CornerLeftUp size={12} className="shrink-0" />
                <span className="truncate">{parentTodo.text.trim() || 'Untitled'}</span>
              </button>
            )}
            <div className="flex items-start gap-3 mb-5">
              <CompletedToggle
                completed={isDone(draft)}
                onToggle={() => onToggle(draft.id)}
                className="mt-1 shrink-0"
              />
              <textarea
                ref={titleRef}
                value={draft.text}
                onChange={(e) => update({ text: e.target.value })}
                onInput={resizeTitle}
                rows={1}
                placeholder="Untitled"
                className={`flex-1 bg-transparent resize-none overflow-hidden text-xl font-bold focus:outline-none leading-snug pt-0.5 placeholder:text-fg-ghost ${
                  isDone(draft) ? 'text-fg-ghost line-through' : 'text-fg'
                }`}
              />
            </div>

            <div className="pl-[34px]">
              <textarea
                ref={notesRef}
                value={draft.notes || ''}
                onChange={(e) => {
                  update({ notes: e.target.value });
                  handleNotesCaretScroll();
                }}
                onInput={() => {
                  resizeNotes();
                  handleNotesCaretScroll();
                }}
                onKeyUp={handleNotesCaretScroll}
                onClick={handleNotesCaretScroll}
                onSelect={handleNotesCaretScroll}
                placeholder="Add notes..."
                className="w-full bg-transparent resize-none overflow-hidden text-sm text-fg-muted placeholder:text-fg-ghost focus:outline-none leading-relaxed min-h-48"
              />
            </div>

            {/* Subtasks - the planner's own table, so the rows behave identically.
                The plain wrapper matters: TableSurface is `flex-1` (basis 0) and
                this pane is a flex column, so as a direct child it would collapse
                to the leftover space and scroll inside itself. Wrapped in a block
                element, flex-1 is inert and the list grows with the pane. */}
            <div className="mt-15.5">
              <div className="ml-8.5 my-1.5 flex items-center gap-2">
                <span className="text-xs font-medium text-fg-faint">Subtasks</span>
              </div>
              <div className="border-t border-line-subtle">
                <TaskTable
                  variant={VARIANTS.subtasks}
                  model={subModel}
                  interaction={subInteraction}
                  rowHandlers={subRowHandlers}
                  dnd={subDnd}
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-fill-subtle shrink-0" />

          {/* Right pane: properties + actions */}
          <div className="w-80 shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-2">

              <RightProp
                icon={<CircleDot size={11} />}
                label="Status"
                onClear={() => update({ status: undefined })}
                canClear={draft.status !== undefined}
              >
                <OptionSelectField
                  options={STATUS_OPTIONS}
                  value={draft.status}
                  onChange={(val) => update({ status: val as Todo['status'] })}
                  variant="inline"
                />
              </RightProp>

              <RightProp
                icon={<Flag size={11} />}
                label="Priority"
                onClear={() => update({ priority: undefined })}
                canClear={draft.priority !== undefined}
              >
                <OptionSelectField
                  options={PRIORITY_OPTIONS}
                  value={draft.priority}
                  onChange={(val) => update({ priority: val as Todo['priority'] })}
                  variant="inline"
                />
              </RightProp>

              <RightProp
                icon={<CalendarDays size={11} />}
                label="Start"
                onClear={() => updateSchedule({ startDate: undefined, ...patchFromTime('start', '') }, 'start')}
                canClear={false}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip
                    value={draft.startDate || ''}
                    placeholder="Date"
                    onChange={handleStartDateChange}
                  />
                  <TimeChip
                    value={draft.startTime}
                    onChange={handleStartTimeChange}
                    disabled={!draft.startDate}
                  />
                </div>
                {scheduleError?.side === 'start' && (
                  <p className="mt-1.5 text-[11px] text-danger">{scheduleError.message}</p>
                )}
              </RightProp>

              <RightProp
                icon={<Clock size={11} />}
                label="Due"
                onClear={() => updateSchedule(patchFromTime('due', ''), 'due')}
                canClear={false}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip
                    value={dateStr}
                    placeholder="Date"
                    onChange={handleDateChange}
                    showInDailyList={draft.showInDatabase ? (draft.showInDailyList ?? false) : undefined}
                    onShowInDailyListChange={draft.showInDatabase ? ((val) => update({ showInDailyList: val })) : undefined}
                    autoMoveDate={draft.autoMoveDate ?? false}
                    onAutoMoveDateChange={(val) => update({ autoMoveDate: val })}
                  />
                  <TimeChip
                    value={draft.dueTime}
                    onChange={handleDueTimeChange}
                    disabled={!dateStr}
                  />
                </div>
                {scheduleError?.side === 'due' && (
                  <p className="mt-1.5 text-[11px] text-danger">{scheduleError.message}</p>
                )}
                {/* Same flag the due-date picker carries, surfaced here too. It's
                    settable without a date - the sweep just has nothing to roll
                    forward until one is set (see the auto-move sweep in app-data). */}
                <div
                  className="mt-2.5 flex items-center justify-between"
                  title={autoMove && !dated ? 'Applies once this task has a due date' : undefined}
                >
                  <span className="flex flex-col">
                    <span className="text-xs text-fg-faint">Move forward if overdue</span>
                    {autoMove && !dated && (
                      <span className="text-[10px] text-fg-faint">Pending a due date</span>
                    )}
                  </span>
                  <Switch
                    checked={autoMove}
                    onChange={(val) => update({ autoMoveDate: val })}
                    aria-label="Move forward if overdue"
                  />
                </div>
              </RightProp>

              {showXpChips && (
                <RightProp
                  icon={<Astroid size={11} />}
                  label="XP"
                  onClear={() => update({ xp: undefined })}
                  canClear={draft.xp !== undefined}
                >
                  <XpChip value={draft.xp} onChange={(val) => update({ xp: val })} />
                </RightProp>
              )}

              {/* Where the task surfaces. Daily needs a date; at least one must stay on. */}
              <RightProp icon={<Database size={11} />} label="Show in">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-fg-faint">Task Planner</span>
                    <Switch
                      checked={plannerOn}
                      disabled={plannerDisabled}
                      onChange={(val) => requestPlannerVisibility(draft.id, val)}
                      aria-label="Show in Task Planner"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between"
                    title={dailyFlag && !dated ? 'Applies once this task has a due date' : undefined}
                  >
                    <span className="flex flex-col">
                      <span className="text-xs text-fg-faint">Daily Tasks</span>
                      {dailyFlag && !dated && (
                        <span className="text-[10px] text-fg-faint">Pending a due date</span>
                      )}
                    </span>
                    <Switch
                      checked={dailyFlag}
                      disabled={dailyDisabled}
                      onChange={(val) => update({ showInDailyList: val })}
                      aria-label="Show in Daily Tasks"
                    />
                  </div>
                </div>
              </RightProp>

              <div className="py-3 space-y-3 ">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium">
                    <Clock size={11} />
                    Created
                  </div>
                  <span className="text-[11px] text-fg-faint font-mono">
                    {format(new Date(draft.createdAt), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>

                {draft.completedAt && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-fg-subtle font-medium">
                      <CircleDot size={11} />
                      Completed
                    </div>
                    <span className="text-[11px] text-fg-faint font-mono">
                      {format(new Date(draft.completedAt), "MMM d, yyyy '·' h:mm a")}
                    </span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* ── Bottom bar: placement (left) + destructive actions (right) ────── */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-t border-line-subtle">
          <div className="flex flex-col items-start gap-2 min-w-0">
            <CollectionPickerButton
              collectionId={derivedCollectionId(draft.parentId ?? null, byId)}
              options={collectionOptions}
              onChange={(id) => update({ parentId: id })}
              onCreate={onCreateCollection}
            />
            <ParentTaskButton
              todoId={draft.id}
              parentId={draft.parentId ?? null}
              onChange={(id) => update({ parentId: id })}
            />
          </div>
          
          <div className="flex flex-col items-stretch gap-0.5 shrink-0 w-32">
            <button
              onClick={handleArchive}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg ${btnGhost()}`}
            >
              <Archive size={14} />
              {draft.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              // A task opened from another task's full view returns to it; anything
              // else has no full view behind it, so it closes the chain outright.
              onClick={() => { onDelete(draft.id); (onDeleteReturn ?? onClose)(); }}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-fg-subtle hover:text-red-400 hover:bg-danger-tint transition-all cursor-pointer"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </motion.div>
      {archiveConfirmModal}
      {plannerVisibilityConfirmModal}
    </motion.div>
  );
};

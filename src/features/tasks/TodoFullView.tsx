import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import {
  X,
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
import { btnGhost } from '@/theme/buttons';
import { Switch } from '@/common/ui';
import { CollectionOption, hasDate } from '@/features/tasks/model';
import { isDone } from '@/features/tasks/model';
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
  onSave: (updated: Todo, newDate: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
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
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle font-medium h-5">
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


export const TodoFullView: React.FC<TodoFullViewProps> = ({
  todo,
  date,
  collectionOptions,
  onCreateCollection,
  byId,
  onClose,
  onSave,
  onToggle,
  onDelete,
  showXpChips,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
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
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resizeTitle, [draft.text, todo.id]);
  useLayoutEffect(resizeNotes, [draft.notes, todo.id]);

  useEffect(() => {
    setDraft(todo);
    setDateStr(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  // Completion is stamped outside the draft - the checkbox toggles through app data,
  // and the save handlers derive completedAt from status - so both fields have to
  // come back from the prop or the Completed timestamp never appears.
  useEffect(() => {
    setDraft(prev =>
      prev.status === todo.status && prev.completedAt === todo.completedAt
        ? prev
        : { ...prev, status: todo.status, completedAt: todo.completedAt }
    );
  }, [todo.status, todo.completedAt]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const update = (patch: Partial<Todo>, nextDate: string = dateStr) => {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      onSave(next, nextDate);
      return next;
    });
  };

  const handleDateChange = (val: string) => {
    setDateStr(val);
    // Clearing the date keeps the showInDailyList flag intact - an undated task
    // simply never reaches any daily list (showsOnDailyChecklist gates on the date),
    // and re-adding a date later sends it straight back. We only ensure it stays
    // reachable in the Planner (mirrors normalizeVisibility).
    if (!val) update({ showInDatabase: true }, '');
    else update({}, val);
  };

  // Each time carries a percent-of-day twin; patchFromTime writes both (and clears
  // both), the same way the Planner's cells do.
  const handleStartTimeChange = (val: string) => update(patchFromTime('start', val));
  const handleDueTimeChange = (val: string) => update(patchFromTime('due', val));

  // "Show in" invariants: the daily flag can be set even without a date (it just
  // stays pending until one is added), but the task must stay reachable on at least
  // one surface - so a switch that is the sole *effective* surface can't be turned
  // off. A daily-flagged task only counts as reachable there once it has a date.
  const dated = hasDate(dateStr);
  const plannerOn = draft.showInDatabase === true;
  const dailyFlag = draft.showInDailyList === true;
  const dailyEffective = dailyFlag && dated; // actually reaches a daily list
  const plannerDisabled = plannerOn && !dailyEffective;
  const dailyDisabled = dailyEffective && !plannerOn;

  const handleArchive = () => {
    const nowArchived = !draft.archived;
    update({ archived: nowArchived });
    if (nowArchived) onClose();
  };

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
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
            className="p-1.5 rounded-lg text-fg-ghost hover:text-fg hover:bg-fill transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Two-pane body ────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left pane: title + notes */}
          <div className="flex-1 flex flex-col overflow-y-auto min-w-0 px-8 py-6 no-scrollbar">
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
                onChange={(e) => update({ notes: e.target.value })}
                onInput={resizeNotes}
                placeholder="Add notes..."
                className="w-full bg-transparent resize-none overflow-hidden text-sm text-fg-muted placeholder:text-fg-ghost focus:outline-none leading-relaxed"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-fill-subtle shrink-0" />

          {/* Right pane: properties + actions */}
          <div className="w-80 shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-2 no-scrollbar">

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
                onClear={() => update({ startDate: undefined, ...patchFromTime('start', '') })}
                canClear={false}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip
                    value={draft.startDate || ''}
                    placeholder="Date"
                    onChange={(val) => update({ startDate: val || undefined })}
                  />
                  <TimeChip
                    value={draft.startTime}
                    percent={draft.startPercentage}
                    onChange={handleStartTimeChange}
                  />
                </div>
              </RightProp>

              <RightProp
                icon={<Clock size={11} />}
                label="Due"
                onClear={() => update(patchFromTime('due', ''))}
                canClear={false}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip
                    value={dateStr}
                    placeholder="Date"
                    onChange={handleDateChange}
                    autoMoveDate={draft.autoMoveDate ?? false}
                    onAutoMoveDateChange={(val) => update({ autoMoveDate: val })}
                  />
                  <TimeChip
                    value={draft.dueTime}
                    percent={draft.duePercentage}
                    onChange={handleDueTimeChange}
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
                      onChange={(val) => update({ showInDatabase: val })}
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

              <div className="border-t border-line-subtle py-3 space-y-3 ">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-fg-subtle font-medium">
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
              onClick={() => { onDelete(draft.id); onClose(); }}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-fg-subtle hover:text-red-400 hover:bg-danger-tint transition-all cursor-pointer"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

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
import { Todo } from '../types';
import { btnGhost } from '../theme/buttons';
import { Switch } from './Switch';
import { CollectionOption, hasDate } from '../utils/todoFilters';
import { isDone } from '../utils/todoStatus';
import { timeToPercentage } from '../utils/timeUtils';
import {
  CompletedToggle,
  OptionSelectField,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './todoFields';
import {
  DateChip,
  TimeChip,
  XpChip,
  CollectionButton,
  ParentTaskButton,
  derivedCollectionId,
} from './taskChips';
import { modalPop, overlayBackdrop } from './modalMotion';

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
      <div className="flex items-center gap-1.5 text-[10px] text-fg-faint font-bold uppercase tracking-wider h-5">
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

  // Grow to fit content with no upper cap — the pane scrolls instead of capping the textarea.
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

  useEffect(() => {
    setDraft(prev =>
      prev.status === todo.status ? prev : { ...prev, status: todo.status }
    );
  }, [todo.status]);

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
    // An undated task can't live on the daily list — drop it off and make sure it
    // stays reachable in the Planner (mirrors normalizeVisibility).
    if (!val) update({ showInDailyList: false, showInDatabase: true }, '');
    else update({}, val);
  };

  // The end time drives the percent-of-day readout (mirrors the table's `end` cell).
  const handleDueTimeChange = (val: string) => {
    update({ dueTime: val || undefined, duePercentage: val ? timeToPercentage(val) : undefined });
  };

  // "Show in" invariants: Daily needs a date, and the task must stay visible on at
  // least one surface — so the sole enabled switch can't be turned off.
  const dailyAllowed = hasDate(dateStr);
  const plannerOn = draft.showInDatabase === true;
  const dailyOn = draft.showInDailyList === true && dailyAllowed;
  const plannerDisabled = plannerOn && !dailyOn;
  const dailyDisabled = !dailyAllowed || (dailyOn && !plannerOn);

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
        <div className="flex items-center justify-between px-4 h-11 border-b border-line-subtle shrink-0">
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
                placeholder="Task name"
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

            {/* Timestamps — below a divider, aligned with the notes column. */}
            <div className="mt-8 pl-[34px]">
              <div className="border-t border-line-subtle pt-4 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-fg-faint font-bold uppercase tracking-wider mb-1.5">
                    <Clock size={11} />
                    Created
                  </div>
                  <span className="text-xs text-fg-faint font-mono">
                    {format(new Date(draft.createdAt), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>

                {draft.completedAt && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] text-fg-faint font-bold uppercase tracking-wider mb-1.5">
                      <CircleDot size={11} />
                      Completed
                    </div>
                    <span className="text-xs text-fg-faint font-mono">
                      {format(new Date(draft.completedAt), "MMM d, yyyy '·' h:mm a")}
                    </span>
                  </div>
                )}
              </div>
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
                onClear={() => update({ startDate: undefined, startTime: undefined })}
                canClear={!!draft.startDate || !!draft.startTime}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip
                    value={draft.startDate || ''}
                    placeholder="Start date"
                    onChange={(val) => update({ startDate: val || undefined })}
                  />
                  <TimeChip
                    value={draft.startTime}
                    onChange={(val) => update({ startTime: val || undefined })}
                  />
                </div>
              </RightProp>

              <RightProp
                icon={<Clock size={11} />}
                label="Due / End time"
                onClear={() => update({ dueTime: undefined, duePercentage: undefined })}
                canClear={draft.dueTime !== undefined}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <DateChip value={dateStr} placeholder="Due date" onChange={handleDateChange} />
                  <TimeChip
                    value={draft.dueTime}
                    percent={draft.duePercentage}
                    onChange={handleDueTimeChange}
                  />
                </div>
              </RightProp>

              <RightProp
                icon={<Astroid size={11} />}
                label="XP"
                onClear={() => update({ xp: undefined })}
                canClear={draft.xp !== undefined}
              >
                <XpChip value={draft.xp} onChange={(val) => update({ xp: val })} />
              </RightProp>

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
                    className={`flex items-center justify-between ${dailyAllowed ? '' : 'opacity-40'}`}
                    title={dailyAllowed ? undefined : 'Set a due date to show this task in Daily Tasks'}
                  >
                    <span className="text-xs text-fg-faint">Daily Tasks</span>
                    <Switch
                      checked={dailyOn}
                      disabled={dailyDisabled}
                      onChange={(val) => update({ showInDailyList: val })}
                      aria-label="Show in Daily Tasks"
                    />
                  </div>
                </div>
              </RightProp>

            </div>
          </div>
        </div>

        {/* ── Bottom bar: placement (left) + destructive actions (right) ────── */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-t border-line-subtle">
          <div className="flex flex-col items-start gap-2 min-w-0">
            <CollectionButton
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
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-fg-subtle hover:text-red-400 hover:bg-danger-tint transition-all"
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

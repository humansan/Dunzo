import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { format, parseISO } from 'date-fns';
import {
  X,
  Trash2,
  CalendarDays,
  Clock,
  Percent,
  Sparkles,
  ArrowRight,
  CircleDot,
  Flag,
  Shapes,
  Archive,
  Database,
} from 'lucide-react';
import { Todo } from '../types';
import { CollectionOption, collectionOf, collectionPath } from '../utils/todoFilters';
import {
  CompletedToggle,
  DateField,
  StartTimeField,
  EndTimeField,
  PercentField,
  XpField,
  CollectionSearchField,
  OptionSelectField,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './todoFields';

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
  <div className={`group/prop py-3 ${noDivider ? '' : 'border-b border-white/5'}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[10px] text-white/35 font-bold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      {onClear && canClear && (
        <button
          type="button"
          onClick={onClear}
          title="Clear"
          className="p-0.5 rounded text-white/20 hover:text-white/60 opacity-0 group-hover/prop:opacity-100 transition-all"
        >
          <X size={11} />
        </button>
      )}
    </div>
    {children}
  </div>
);

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${
      value ? 'bg-[var(--accent2)]' : 'bg-white/15'
    }`}
  >
    <span
      className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
        value ? 'translate-x-[18px]' : 'translate-x-[2px]'
      }`}
    />
  </button>
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
    el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
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
      prev.completed === todo.completed && prev.status === todo.status
        ? prev
        : { ...prev, completed: todo.completed, status: todo.status }
    );
  }, [todo.completed, todo.status]);

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
    if (!val) return;
    setDateStr(val);
    update({}, val);
  };

  const handleArchive = () => {
    const nowArchived = !draft.archived;
    update({ archived: nowArchived });
    if (nowArchived) onClose();
  };

  const fieldCls =
    'w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors';

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="w-[900px] max-w-[95vw] h-[78vh] min-h-[500px] max-h-[900px] bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* ── Top bar ─────────────────────────────── */}
        <div className="flex items-center justify-between px-4 h-11 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 text-white/40 text-xs font-semibold">
            <CalendarDays size={14} />
            {dateStr ? format(parseISO(dateStr), 'EEE, MMM d') : 'No date'}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
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
                completed={draft.completed}
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
                className={`flex-1 bg-transparent resize-none overflow-hidden text-xl font-bold focus:outline-none leading-snug pt-0.5 placeholder:text-white/20 ${
                  draft.completed ? 'text-white/25 line-through' : 'text-white'
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
                className="w-full bg-transparent resize-none overflow-hidden text-sm text-white/70 placeholder:text-white/25 focus:outline-none leading-relaxed"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-white/5 shrink-0" />

          {/* Right pane: properties + actions */}
          <div className="w-72 shrink-0 flex flex-col overflow-hidden">
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
                  onChange={(val) =>
                    update({ status: val as Todo['status'], completed: val === 'completed' })
                  }
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
                icon={<Shapes size={11} />}
                label="Collection"
                onClear={() => update({ parentId: null })}
                canClear={collectionOf(draft, byId) !== null}
              >
                <CollectionSearchField
                  variant="seamless"
                  value={collectionOf(draft, byId)}
                  currentPath={collectionPath(collectionOf(draft, byId), byId).map((c) => ({
                    id: c.id,
                    name: c.text || 'Untitled',
                    color: c.color,
                  }))}
                  options={collectionOptions}
                  onChange={(id) => update({ parentId: id })}
                  onCreate={onCreateCollection}
                />
              </RightProp>

              <RightProp icon={<CalendarDays size={11} />} label="Start Date">
                <DateField
                  value={draft.startDate || ''}
                  onChange={(val) => update({ startDate: val || undefined })}
                  className={fieldCls}
                />
              </RightProp>

              <RightProp icon={<CalendarDays size={11} />} label="Due Date">
                <DateField
                  value={dateStr}
                  onChange={handleDateChange}
                  className={fieldCls}
                />
              </RightProp>

              {/* Time: start → due, and % under due. Shared clear button on hover. */}
              <div className="group/time relative py-3 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/35 font-bold uppercase tracking-wider">
                    <Clock size={11} />
                    Time
                  </div>
                  {(draft.startTime || draft.dueTime || draft.duePercentage !== undefined) && (
                    <button
                      type="button"
                      onClick={() => update({ startTime: undefined, dueTime: undefined, duePercentage: undefined })}
                      title="Clear time"
                      className="p-0.5 rounded text-white/20 hover:text-white/60 opacity-0 group-hover/time:opacity-100 transition-all"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_14px_1fr] items-center gap-1.5">
                    <StartTimeField
                      value={draft.startTime}
                      onChange={(patch) => update(patch)}
                      className={fieldCls}
                    />
                    <ArrowRight size={11} className="justify-self-center text-white/30" />
                    <EndTimeField
                      value={draft.dueTime}
                      onChange={(patch) => update(patch)}
                      className={fieldCls}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_14px_1fr] items-center gap-1.5">
                    <div className="flex items-center gap-1.5 text-white/25 text-[10px] pl-1">
                      <Percent size={10} />
                      due
                    </div>
                    <div />
                    <PercentField
                      value={draft.duePercentage}
                      onChange={(patch) => update(patch)}
                      className={fieldCls}
                    />
                  </div>
                </div>
              </div>

              <RightProp
                icon={<Sparkles size={11} />}
                label="XP"
                onClear={() => update({ xp: undefined })}
                canClear={draft.xp !== undefined}
              >
                <XpField
                  value={draft.xp}
                  onChange={(val) => update({ xp: val })}
                  className={fieldCls}
                />
              </RightProp>

              <RightProp icon={<Database size={11} />} label="Task Planner">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">Show in hub</span>
                  <Toggle
                    value={draft.showInDatabase ?? false}
                    onChange={(val) => update({ showInDatabase: val })}
                  />
                </div>
              </RightProp>

              <div className="py-3 border-b border-white/5">
                <div className="flex items-center gap-1.5 text-[10px] text-white/35 font-bold uppercase tracking-wider mb-1.5">
                  <Clock size={11} />
                  Created
                </div>
                <span className="text-xs text-white/40 font-mono">
                  {format(new Date(draft.createdAt), "MMM d, yyyy '·' h:mm a")}
                </span>
              </div>

              {draft.completedAt && (
                <div className="py-3 border-b border-white/5">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/35 font-bold uppercase tracking-wider mb-1.5">
                    <CircleDot size={11} />
                    Completed
                  </div>
                  <span className="text-xs text-white/40 font-mono">
                    {format(new Date(draft.completedAt), "MMM d, yyyy '·' h:mm a")}
                  </span>
                </div>
              )}

            </div>

            {/* Bottom: Archive + Delete */}
            <div className="shrink-0 px-5 py-4 border-t border-white/5 space-y-0.5">
              <button
                onClick={handleArchive}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-all"
              >
                <Archive size={14} />
                {draft.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={() => { onDelete(draft.id); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-red-400 hover:bg-[#d93d42]/10 transition-all"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

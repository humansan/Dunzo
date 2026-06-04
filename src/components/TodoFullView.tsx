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
  NotesField,
  CollectionSearchField,
  OptionSelectField,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './todoFields';

interface TodoFullViewProps {
  todo: Todo;
  date: string; // YYYY-MM-DD the todo currently lives on
  collectionOptions: CollectionOption[]; // collections available to assign
  onCreateCollection: (name: string) => string;
  byId: Map<string, Todo>; // for resolving the current collection path
  onClose: () => void;
  onSave: (updated: Todo, newDate: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

// Reusable labelled property row (left icon + label, right control).
// `noDivider` omits the bottom border so related rows can be visually grouped.
const PropertyRow: React.FC<{
  icon: React.ReactNode;
  label?: string;
  children: React.ReactNode;
  noDivider?: boolean;
  pad?: string; // override default vertical padding (e.g. to tighten grouped rows)
  onClear?: () => void; // when set & canClear, shows a clear (×) button on hover
  canClear?: boolean;
}> = ({ icon, label, children, noDivider, pad = 'py-3', onClear, canClear }) => (
  <div className={`group/row flex items-start gap-3 ${pad} ${noDivider ? '' : 'border-b border-white/5'}`}>
    <div className="flex items-center gap-2 w-28 shrink-0 pt-1.5 text-white/40 text-[10px] font-bold uppercase tracking-widest">
      {icon}
      {label}
    </div>
    <div className="flex-1 min-w-0">{children}</div>
    {onClear && canClear && (
      <button
        type="button"
        onClick={onClear}
        title="Clear"
        className="shrink-0 mt-1 p-1 rounded-md text-white/20 hover:text-white/70 hover:bg-white/5 opacity-0 group-hover/row:opacity-100 transition-all"
      >
        <X size={14} />
      </button>
    )}
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
  onDelete
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Local draft — synced only when switching to a different todo
  const [draft, setDraft] = useState<Todo>(todo);
  const [dateStr, setDateStr] = useState(date);

  // Auto-size the title textarea: grows to fit as many lines as needed (no cap).
  const resizeTitle = () => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Re-measure when content changes or a different todo opens.
  useLayoutEffect(resizeTitle, [draft.text, todo.id]);

  useEffect(() => {
    setDraft(todo);
    setDateStr(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id]);

  // Toggling completion flows through the parent; mirror completion + the synced
  // status back into the draft (without clobbering other in-progress edits) so the
  // panel reflects the checked state, the Status pill, and plays its animation.
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

  // Update draft + persist upward (auto-save, Todoist-style)
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

  const inputClass =
    'w-full max-w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-sm focus:outline-none focus:border-[var(--accent2)] transition-colors';

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm py-[6vh] px-4 overflow-y-auto"
    >
        <motion.div
          initial={{ scale: 0.97, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="w-full max-w-[640px] bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[88vh]"
        >
          {/* ── Top bar ─────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 text-white/40 text-xs font-semibold">
              <CalendarDays size={14} />
              {dateStr ? format(parseISO(dateStr), 'EEE, MMM d') : 'No date'}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { onDelete(draft.id); onClose(); }}
                title="Delete task"
                className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-[#d93d42]/10 transition-all"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={onClose}
                title="Close"
                className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5">
            {/* Title */}
            <div className="flex items-start gap-3">
              <CompletedToggle
                completed={draft.completed}
                onToggle={() => onToggle(draft.id)}
                className="mt-1"
              />
              <textarea
                ref={titleRef}
                value={draft.text}
                onChange={(e) => update({ text: e.target.value })}
                onInput={resizeTitle}
                rows={1}
                placeholder="Task name"
                className={`flex-1 bg-transparent resize-none overflow-hidden text-xl font-bold focus:outline-none leading-snug pt-0.5 transition-all duration-200 ease-out placeholder:text-white/20 ${draft.completed ? 'text-white/25 line-through translate-x-[4px]' : 'text-white'}`}
              />
            </div>

            {/* Notes / description — auto-grows up to ~6 lines, then scrolls */}
            <div className="group/notes flex items-start gap-2 mt-4 pl-[34px]">
              <NotesField
                value={draft.notes || ''}
                onChange={(val) => update({ notes: val })}
                minHeight={48}
                maxHeight={176}
                className="flex-1 bg-transparent resize-none text-sm text-white/80 placeholder:text-white/25 focus:outline-none leading-relaxed overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
              />
              {draft.notes && (
                <button
                  type="button"
                  onClick={() => update({ notes: '' })}
                  title="Clear notes"
                  className="shrink-0 mt-0.5 p-1 rounded-md text-white/20 hover:text-white/70 hover:bg-white/5 opacity-0 group-hover/notes:opacity-100 transition-all"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* ── Properties ──────────────────────────── */}
            <div className="mt-4">
              <PropertyRow
                icon={<CircleDot size={13} />}
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
              </PropertyRow>

              <PropertyRow
                icon={<Flag size={13} />}
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
              </PropertyRow>

              <PropertyRow icon={<CalendarDays size={13} />} label="Date">
                <DateField
                  value={dateStr}
                  onChange={handleDateChange}
                  className={`${inputClass} font-mono text-xs`}
                />
              </PropertyRow>

              {/* Time + % Time share one clear button (the two are synced).
                  Start → End on one row; the % aligns under the End box since it
                  tracks the end time. */}
              <div className="group/time relative">
                <PropertyRow icon={<Clock size={13} />} label="Time" noDivider pad="pt-3 pb-1">
                  <div className="grid grid-cols-[140px_24px_140px] items-center gap-2">
                    <StartTimeField
                      value={draft.startTime}
                      onChange={(patch) => update(patch)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors"
                    />
                    <ArrowRight size={14} className="justify-self-center text-white/30" />
                    <EndTimeField
                      value={draft.dueTime}
                      onChange={(patch) => update(patch)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors"
                    />
                  </div>
                </PropertyRow>

                <PropertyRow icon={<Percent size={13} />} pad="pt-1 pb-3">
                  <div className="grid grid-cols-[140px_24px_140px] items-center gap-2">
                    <div />
                    <div />
                    <PercentField
                      value={draft.duePercentage}
                      onChange={(patch) => update(patch)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors"
                    />
                  </div>
                </PropertyRow>

                {(draft.startTime || draft.dueTime || draft.duePercentage !== undefined) && (
                  <button
                    type="button"
                    onClick={() => update({ startTime: undefined, dueTime: undefined, duePercentage: undefined })}
                    title="Clear"
                    className="absolute top-1/2 -translate-y-1/2 right-0 p-1 rounded-md text-white/20 hover:text-white/70 hover:bg-white/5 opacity-0 group-hover/time:opacity-100 transition-all"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <PropertyRow
                icon={<Shapes size={13} />}
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
              </PropertyRow>

              <PropertyRow
                icon={<Sparkles size={13} />}
                label="XP"
                noDivider
                onClear={() => update({ xp: undefined })}
                canClear={draft.xp !== undefined}
              >
                <XpField
                  value={draft.xp}
                  onChange={(val) => update({ xp: val })}
                  className={`${inputClass} font-mono text-xs`}
                />
              </PropertyRow>
            </div>
          </div>
        </motion.div>
    </motion.div>
  );
};

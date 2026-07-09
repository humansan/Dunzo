import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, CircleDot, Flag } from 'lucide-react';
import { timeToPercentage } from '../utils/timeUtils';
import { CollectionOption } from '../utils/todoFilters';
import { TodoStatus, TodoPriority } from '../types';
import { btnAccent } from '../theme/buttons';
import { statusOption, priorityOption, STATUS_OPTIONS, PRIORITY_OPTIONS } from './todoFields';
import {
  DateChip,
  TimeChip,
  XpChip,
  OptionChipButton,
  CollectionButton,
  ParentTaskButton,
  derivedCollectionId,
} from './taskChips';
import { useAppData } from '../data/AppDataContext';

export interface QuickEditValues {
  text: string;
  notes: string;
  date: string;            // YYYY-MM-DD — the due date (drives the daily-list day)
  startTime?: string;      // HH:MM (carried through; cleared alongside the end time)
  dueTime?: string;        // HH:MM
  duePercentage?: number;
  xp?: number;
  status?: TodoStatus;
  priority?: TodoPriority;
  parentId?: string | null; // immediate parent (a task or a collection)
}

interface QuickEditTodoProps {
  mode: 'add' | 'edit';
  todoId?: string;              // edit mode: excludes self + subtree from the parent picker
  initialText?: string;
  initialNotes?: string;
  initialDate: string;
  initialStartTime?: string;
  initialTime?: string;
  initialPercent?: number;
  initialXp?: number;
  initialStatus?: TodoStatus;
  initialPriority?: TodoPriority;
  initialParentId?: string | null;
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
  onSubmit: (vals: QuickEditValues) => void;
  onCancel: () => void;
  onOpenFull?: () => void;          // edit mode: jump to the full view
  onFlush?: (vals: QuickEditValues) => void; // edit mode: persist on forced close
}

export const QuickEditTodo: React.FC<QuickEditTodoProps> = ({
  mode,
  todoId,
  initialText,
  initialNotes,
  initialDate,
  initialStartTime,
  initialTime,
  initialPercent,
  initialXp,
  initialStatus,
  initialPriority,
  initialParentId,
  collectionOptions = [],
  onCreateCollection,
  onSubmit,
  onCancel,
  onOpenFull,
  onFlush,
}) => {
  // Used to resolve the immediate parent into the collection breadcrumb.
  const { todoById } = useAppData();

  const [text, setText] = useState(initialText || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [date, setDate] = useState(initialDate);          // due date
  // The quick editor only exposes an end time, but it carries the start time
  // through so the Clear button can wipe both (and not silently keep a start).
  const [startTime, setStartTime] = useState(initialStartTime || '');
  const [time, setTime] = useState(initialTime || '');    // due time
  const [percentStr, setPercentStr] = useState(initialPercent?.toString() ?? '');
  const [xpStr, setXpStr] = useState(initialXp?.toString() ?? '');
  const [status, setStatus] = useState<TodoStatus | undefined>(initialStatus);
  const [priority, setPriority] = useState<TodoPriority | undefined>(initialPriority);
  const [parentId, setParentId] = useState<string | null>(initialParentId ?? null);

  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const collId = derivedCollectionId(parentId, todoById);

  // Auto-size the notes textarea: one line by default, growing with content and
  // capping at ~3 lines before it becomes scrollable.
  const NOTES_MIN_HEIGHT = 24; // px, ~1 line
  const NOTES_MAX_HEIGHT = 70; // px, ~3 lines
  const resizeNotes = () => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, NOTES_MIN_HEIGHT), NOTES_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > NOTES_MAX_HEIGHT ? 'auto' : 'hidden';
  };
  useLayoutEffect(resizeNotes, [notes]);

  // Guards for the flush-on-unmount behaviour
  const committedRef = useRef(false);                       // true after Save/Cancel
  const latestRef = useRef<QuickEditValues | null>(null);   // current values snapshot

  const buildValues = (): QuickEditValues => ({
    text: text.trim(),
    notes,
    date,
    startTime: startTime || undefined,
    dueTime: time || undefined,
    duePercentage: percentStr ? parseFloat(percentStr) : undefined,
    xp: xpStr ? Math.max(0, parseInt(xpStr) || 0) : undefined,
    status,
    priority,
    parentId,
  });

  // Keep the latest snapshot fresh for the unmount flush.
  latestRef.current = buildValues();

  // Re-seed when the target changes (e.g. switching which todo is being edited)
  useEffect(() => {
    setText(initialText || '');
    setNotes(initialNotes || '');
    setDate(initialDate);
    setStartTime(initialStartTime || '');
    setTime(initialTime || '');
    setPercentStr(initialPercent?.toString() ?? '');
    setXpStr(initialXp?.toString() ?? '');
    setStatus(initialStatus);
    setPriority(initialPriority);
    setParentId(initialParentId ?? null);
    committedRef.current = false;
  }, [initialText, initialNotes, initialDate, initialStartTime, initialTime, initialPercent, initialXp, initialStatus, initialPriority, initialParentId]);

  // On unmount, if an edit panel is force-closed (not via Save/Cancel), persist
  // its current values so switching panels doesn't lose changes.
  useEffect(() => {
    return () => {
      if (mode === 'edit' && !committedRef.current && onFlush) {
        const v = latestRef.current;
        if (v && v.text.trim()) onFlush(v);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeChange = (val: string) => {
    setTime(val);
    if (!val) { setPercentStr(''); setStartTime(''); return; }
    const p = timeToPercentage(val);
    if (p !== undefined) setPercentStr(p.toString());
  };

  const canSubmit = text.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    committedRef.current = true;
    onSubmit(buildValues());
    if (mode === 'add') {
      // Keep the panel open for rapid entry (Todoist-style): reset & refocus.
      setText('');
      setNotes('');
      setStartTime('');
      setTime('');
      setPercentStr('');
      setXpStr('');
      setStatus(undefined);
      setPriority(undefined);
      setParentId(null);
      setDate(initialDate);
      committedRef.current = false;
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  };

  const cancel = () => {
    committedRef.current = true;
    onCancel();
  };

  return (
    <div
      onKeyDown={(e) => {
        // Chips stop Enter/Escape while their popover is open, so these only fire
        // when no editor is up.
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      className="my-2 mx-4 p-3.5 bg-surface border border-[var(--accent2)]/30 rounded-2xl shadow-xl"
    >
      <input
        ref={nameRef}
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Task name"
        className="w-full bg-transparent text-fg text-base font-medium placeholder:text-fg-ghost focus:outline-none"
      />

      <textarea
        ref={notesRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onInput={resizeNotes}
        rows={1}
        placeholder="Add notes…"
        className="w-full bg-transparent resize-none text-fg-muted text-sm leading-relaxed placeholder:text-fg-ghost focus:outline-none mt-2 overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-fill-stronger"
      />

      {/* Chips — Date · Time+% · XP · Status · Priority */}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <DateChip value={date} onChange={setDate} placeholder="Due date" />
        <TimeChip
          value={time}
          percent={percentStr === '' ? undefined : parseFloat(percentStr)}
          onChange={handleTimeChange}
        />
        <XpChip
          value={xpStr === '' ? undefined : Math.max(0, parseInt(xpStr) || 0)}
          onChange={(v) => setXpStr(v == null ? '' : String(v))}
        />
        <div className="flex">
          <OptionChipButton
            icon={<CircleDot size={16} className="shrink-0 text-fg-subtle" />}
            placeholder="Status"
            value={status}
            option={status ? statusOption(status) : undefined}
            options={STATUS_OPTIONS}
            onChange={(v) => setStatus(v as TodoStatus | undefined)}
          />
          <OptionChipButton
            icon={<Flag size={16} className="shrink-0 text-fg-subtle" />}
            placeholder="Priority"
            value={priority}
            option={priority ? priorityOption(priority) : undefined}
            options={PRIORITY_OPTIONS}
            onChange={(v) => setPriority(v as TodoPriority | undefined)}
          />
        </div>
      </div>

      {/* Collection · Set parent task */}
      <div className="flex items-stretch gap-1 mt-3 flex-wrap">
        <CollectionButton
          collectionId={collId}
          options={collectionOptions}
          onChange={setParentId}
          onCreate={(name) => (onCreateCollection ? onCreateCollection(name) : '')}
        />
        <ParentTaskButton todoId={todoId} parentId={parentId} onChange={setParentId} />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2">
        {mode === 'edit' && onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            title="Open full view"
            className="p-1.5 -ml-1 text-fg-faint hover:text-fg-muted hover:bg-fill-subtle rounded-md"
          >
            <Maximize2 size={15} />
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={cancel}
          className="px-3 h-8 bg-fill-subtle hover:bg-fill text-fg-subtle rounded-lg text-xs font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={`px-4 h-8 rounded-lg text-xs disabled:cursor-not-allowed ${btnAccent('accent2')}`}
        >
          {mode === 'add' ? 'Add task' : 'Save changes'}
        </button>
      </div>
    </div>
  );
};

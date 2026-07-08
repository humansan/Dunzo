import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Astroid, Maximize2, X, Shapes, CircleDot, Flag, GitBranch } from 'lucide-react';
import { formatTime12h, timeToPercentage, percentageToTime } from '../utils/timeUtils';
import { CollectionOption, collectionOf } from '../utils/todoFilters';
import { TodoStatus, TodoPriority } from '../types';
import { btnAccent } from '../theme/buttons';
import {
  CollectionSearchField,
  CollectionBreadcrumb,
  OptionSelectField,
  statusOption,
  priorityOption,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './todoFields';
import { pillBg, pillText } from '../theme/pill';
import { XpSlider } from './XpSlider';
import { CalendarInput } from './CalendarInput';
import { TaskFinder } from './todosHub/TaskFinder';
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

type EditorKey = 'date' | 'time' | 'xp' | 'status' | 'priority' | 'collection';

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
  // Global data for the parent picker + collection/parent display (this panel only
  // ever renders inside the authed app, so the context is always present).
  const { searchEntries, todoById, handleHubSaveTodo, handleToggleTodo } = useAppData();

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

  // Which chip's dropdown editor is open (null = none), plus the standalone
  // TaskFinder overlay for picking a parent task.
  const [openEditor, setOpenEditor] = useState<EditorKey | null>(null);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const wrapRefs: Record<EditorKey, React.RefObject<HTMLDivElement | null>> = {
    date: useRef<HTMLDivElement>(null),
    time: useRef<HTMLDivElement>(null),
    xp: useRef<HTMLDivElement>(null),
    status: useRef<HTMLDivElement>(null),
    priority: useRef<HTMLDivElement>(null),
    collection: useRef<HTMLDivElement>(null),
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Resolve the immediate parent → its collection breadcrumb (walking up to the
  // nearest collection) and, when the immediate parent is a task, its name.
  const parentTodo = parentId ? todoById.get(parentId) ?? null : null;
  const parentTaskName = parentTodo && !parentTodo.isCollection ? (parentTodo.text || 'Untitled') : null;
  const collId = parentTodo
    ? (parentTodo.isCollection ? parentTodo.id : collectionOf(parentTodo, todoById))
    : null;
  const currentCollection = collId ? (collectionOptions.find(o => o.id === collId) ?? null) : null;

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
    setOpenEditor(null);
    setParentPickerOpen(false);
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

  // Close the open dropdown when clicking elsewhere. The self-shelled panels
  // (Calendar/XP) render inside the chip wrapper, so their clicks aren't outside.
  useEffect(() => {
    if (!openEditor) return;
    const onDown = (e: MouseEvent) => {
      const wrap = wrapRefs[openEditor].current;
      if (wrap && !wrap.contains(e.target as Node)) setOpenEditor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openEditor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeChange = (val: string) => {
    setTime(val);
    if (!val) { setPercentStr(''); return; }
    const p = timeToPercentage(val);
    if (p !== undefined) setPercentStr(p.toString());
  };

  const handlePercentChange = (val: string) => {
    setPercentStr(val);
    if (val === '') return;
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const t = percentageToTime(num);
      if (t) setTime(t);
    }
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
      setOpenEditor(null);
      committedRef.current = false;
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  };

  const cancel = () => {
    committedRef.current = true;
    onCancel();
  };

  // Exclude the edited task and its whole subtree from the parent picker (no cycles).
  const parentDisabled = (id: string): boolean => {
    if (!todoId) return false;
    if (id === todoId) return true;
    let p = todoById.get(id)?.parentId ?? null;
    const seen = new Set<string>();
    while (p && todoById.has(p) && !seen.has(p)) {
      if (p === todoId) return true;
      seen.add(p);
      p = todoById.get(p)!.parentId ?? null;
    }
    return false;
  };

  const pct = percentStr === ''
    ? null
    : (Number.isInteger(+percentStr) ? +percentStr : Math.round(+percentStr));

  // Chip recipes (mirror the list-view time/percent badge).
  const chipBase =
    'flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg cursor-pointer';
  const chipText =
    'flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium';
  const fieldBase =
    'bg-fill-subtle border border-line rounded-lg px-3 h-9 text-fg text-sm font-mono focus:outline-none focus:border-[var(--accent2)]';
  const popover =
    'absolute z-20 top-full left-0 mt-2 rounded-xl border border-line bg-surface shadow-2xl p-2';
  // The collection / parent buttons: chip height, left-aligned, free to grow to the
  // full panel width (truncating only at the edge), with a hover-lit background.
  const rowBtn =
    'flex items-center gap-2 px-2.75 py-[5.5px] rounded-lg cursor-pointer text-[13px] leading-none font-mono font-medium min-w-0 max-w-full overflow-hidden bg-fill-subtle hover:bg-fill transition-colors';
  // Keep Enter inside a popover from bubbling up and submitting the whole panel.
  const stopEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.stopPropagation(); };

  // A status/priority pill chip — styled like the collection chip: icon + tinted
  // pill when set (bg/text from the option color), muted button when empty.
  const optionChip = (
    key: 'status' | 'priority',
    icon: React.ReactNode,
    label: string,
    value: string | undefined,
    color: string | undefined,
    options: typeof STATUS_OPTIONS,
    onChange: (v: string | undefined) => void,
  ) => (
    <div ref={wrapRefs[key]} className="relative">
      <button
        type="button"
        onClick={() => setOpenEditor(o => (o === key ? null : key))}
        style={value ? { backgroundColor: pillBg(color!) } : undefined}
        className={`${chipBase} ${value ? '' : 'bg-fill-subtle hover:bg-fill'}`}
      >
        <span
          className={`${chipText} ${value ? '' : 'text-fg-subtle'}`}
          style={value ? { color: pillText(color!) } : undefined}
        >
          {icon}
          <span className="relative top-px">{label}</span>
        </span>
      </button>
      {openEditor === key && (
        <div className={`${popover} w-48`} onKeyDown={stopEnter}>
          <OptionSelectField
            options={options}
            value={value}
            onChange={(v) => { onChange(v); setOpenEditor(null); }}
          />
        </div>
      )}
    </div>
  );

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (openEditor) setOpenEditor(null); else cancel();
        }
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
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {/* Date */}
        <div ref={wrapRefs.date} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => (o === 'date' ? null : 'date'))}
            className={`${chipBase} ${date ? 'bg-[var(--accent2)]/7 hover:bg-[var(--accent2)]/15' : 'bg-fill-subtle hover:bg-fill'}`}
          >
            <span className={`${chipText} ${date ? 'text-[var(--accent2)]' : 'text-fg-subtle'}`}>
              <Calendar size={16} />
              <span className="relative top-px">{date ? format(parseISO(date), 'MM/dd/yyyy') : 'Due date'}</span>
            </span>
          </button>
          {openEditor === 'date' && (
            <div className="absolute z-20 top-full left-0 mt-2" onKeyDown={stopEnter}>
              <CalendarInput value={date} autoFocus onChange={setDate} />
            </div>
          )}
        </div>

        {/* Time + % */}
        <div ref={wrapRefs.time} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => (o === 'time' ? null : 'time'))}
            className={`${chipBase} ${time ? 'bg-[var(--accent1)]/7 hover:bg-[var(--accent1)]/15' : 'bg-fill-subtle hover:bg-fill'}`}
          >
            {time ? (
              <>
                <span className={`${chipText} text-[var(--accent1)]`}>
                  <Clock size={16} />
                  <span className="relative top-px">{formatTime12h(time)}</span>
                </span>
                {pct !== null && <div className="w-px h-4 bg-[var(--accent1)]/20" />}
                {pct !== null && (
                  <span className={`${chipText} text-[var(--accent1)]`}>
                    <span className="relative top-px">{pct}%</span>
                  </span>
                )}
              </>
            ) : (
              <span className={`${chipText} text-fg-subtle`}>
                <Clock size={16} />
                <span className="relative top-px">Time</span>
              </span>
            )}
          </button>
          {openEditor === 'time' && (
            <div className={popover} onKeyDown={stopEnter}>
              <div className="flex items-center gap-2">
                <div className="flex items-center h-9 bg-fill-subtle border border-line rounded-lg focus-within:border-[var(--accent2)] overflow-hidden">
                  <input
                    autoFocus
                    type="time"
                    value={time}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="bg-transparent px-3 h-full text-fg text-sm font-mono focus:outline-none w-[128px]"
                  />
                  <div className="w-px h-4 bg-fill-strong shrink-0" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={percentStr}
                    onChange={(e) => handlePercentChange(e.target.value)}
                    placeholder="%"
                    className="bg-transparent px-3 h-full text-fg text-sm font-mono focus:outline-none w-[78px]"
                  />
                </div>
                {(time || startTime) && (
                  <button
                    type="button"
                    onClick={() => { setStartTime(''); setTime(''); setPercentStr(''); setOpenEditor(null); }}
                    title="Clear"
                    className="shrink-0 p-1.5 rounded-md text-fg-faint hover:text-fg-muted hover:bg-fill-subtle"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* XP */}
        <div ref={wrapRefs.xp} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => (o === 'xp' ? null : 'xp'))}
            className={`${chipBase} ${xpStr !== '' ? 'bg-warning-tint text-warning' : 'bg-fill-subtle hover:bg-fill'}`}
          >
            <span className={chipText}>
              <Astroid size={16} className={xpStr !== '' ? '' : 'text-fg-subtle'} />
              <span className={`relative top-px ${xpStr !== '' ? '' : 'text-fg-subtle'}`}>
                {xpStr !== '' ? `${Math.max(0, parseInt(xpStr) || 0)} XP` : 'XP'}
              </span>
            </span>
          </button>
          {openEditor === 'xp' && (
            <div className="absolute z-20 top-full left-0 mt-2">
              <XpSlider
                value={xpStr === '' ? undefined : Math.max(0, parseInt(xpStr) || 0)}
                onChange={(v) => setXpStr(v == null ? '' : String(v))}
              />
            </div>
          )}
        </div>

        {/* Status */}
        {optionChip(
          'status', <CircleDot size={16} />,
          status ? statusOption(status)!.label : 'Status',
          status, status ? statusOption(status)!.color : undefined,
          STATUS_OPTIONS, (v) => setStatus(v as TodoStatus | undefined),
        )}

        {/* Priority */}
        {optionChip(
          'priority', <Flag size={16} />,
          priority ? priorityOption(priority)!.label : 'Priority',
          priority, priority ? priorityOption(priority)!.color : undefined,
          PRIORITY_OPTIONS, (v) => setPriority(v as TodoPriority | undefined),
        )}
      </div>

      {/* Collection · Set parent task */}
      <div className="flex items-stretch gap-2 mt-2 flex-wrap">
        <div ref={wrapRefs.collection} className="relative min-w-0 max-w-full">
          <button
            type="button"
            onClick={() => setOpenEditor(o => (o === 'collection' ? null : 'collection'))}
            className={rowBtn}
          >
            <Shapes size={16} className="shrink-0 text-fg-subtle" />
            {currentCollection
              ? <CollectionBreadcrumb path={currentCollection.path} className="min-w-0" />
              : <span className="text-fg-subtle">Collection</span>}
          </button>
          {openEditor === 'collection' && (
            <div className={`${popover} w-64`} onKeyDown={stopEnter}>
              <CollectionSearchField
                value={collId}
                currentPath={currentCollection?.path || []}
                options={collectionOptions}
                onChange={(id) => { setParentId(id); setOpenEditor(null); }}
                onCreate={(name) => (onCreateCollection ? onCreateCollection(name) : '')}
                autoFocus
              />
            </div>
          )}
        </div>

        <button type="button" onClick={() => setParentPickerOpen(true)} className={rowBtn}>
          <GitBranch size={16} className="shrink-0 text-fg-subtle" />
          {parentTaskName
            ? <span className="min-w-0 truncate text-fg">{parentTaskName}</span>
            : <span className="text-fg-subtle">Set parent task</span>}
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-3">
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

      {/* Parent-task picker (portals to body) */}
      {parentPickerOpen && (
        <TaskFinder
          entries={searchEntries}
          todoById={todoById}
          onSaveTodo={handleHubSaveTodo}
          onToggleTodo={handleToggleTodo}
          title="Set parent task"
          placeholder="Search for a task to nest under…"
          isDisabled={parentDisabled}
          rootOption={{ label: 'No parent (top level)', onSelect: () => { setParentId(null); setParentPickerOpen(false); } }}
          onPick={(id) => { setParentId(id); setParentPickerOpen(false); }}
          onClose={() => setParentPickerOpen(false)}
        />
      )}
    </div>
  );
};

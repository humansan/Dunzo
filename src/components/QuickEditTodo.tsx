import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Sparkles, Maximize2, X, Shapes } from 'lucide-react';
import { formatTime12h, timeToPercentage, percentageToTime } from '../utils/timeUtils';
import { CollectionOption } from '../utils/todoFilters';
import { CollectionSearchField } from './todoFields';

export interface QuickEditValues {
  text: string;
  notes: string;
  date: string;            // YYYY-MM-DD
  startTime?: string;      // HH:MM
  dueTime?: string;        // HH:MM
  duePercentage?: number;
  xp?: number;
  collectionId?: string | null; // assigned collection (positional → parentId)
}

interface QuickEditTodoProps {
  mode: 'add' | 'edit';
  initialText?: string;
  initialNotes?: string;
  initialDate: string;
  initialStartTime?: string;
  initialTime?: string;
  initialPercent?: number;
  initialXp?: number;
  initialCollectionId?: string | null;
  collectionOptions?: CollectionOption[];
  onCreateCollection?: (name: string) => string;
  onSubmit: (vals: QuickEditValues) => void;
  onCancel: () => void;
  onOpenFull?: () => void;          // edit mode: jump to the full view
  onFlush?: (vals: QuickEditValues) => void; // edit mode: persist on forced close
}

const GOLD = '#ffba44';

export const QuickEditTodo: React.FC<QuickEditTodoProps> = ({
  mode,
  initialText,
  initialNotes,
  initialDate,
  initialStartTime,
  initialTime,
  initialPercent,
  initialXp,
  initialCollectionId,
  collectionOptions = [],
  onCreateCollection,
  onSubmit,
  onCancel,
  onOpenFull,
  onFlush
}) => {
  const [text, setText] = useState(initialText || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [date, setDate] = useState(initialDate);
  // The quick editor only exposes an end time, but it carries the start time
  // through so the Clear button can wipe both (and not silently keep a start).
  const [startTime, setStartTime] = useState(initialStartTime || '');
  const [time, setTime] = useState(initialTime || '');
  const [percentStr, setPercentStr] = useState(initialPercent?.toString() ?? '');
  const [xpStr, setXpStr] = useState(initialXp?.toString() ?? '');
  const [collectionId, setCollectionId] = useState<string | null>(initialCollectionId ?? null);

  // Which chip's dropdown editor is open (null = none)
  const [openEditor, setOpenEditor] = useState<'date' | 'time' | 'xp' | 'collection' | null>(null);
  const dateWrapRef = useRef<HTMLDivElement>(null);
  const timeWrapRef = useRef<HTMLDivElement>(null);
  const xpWrapRef = useRef<HTMLDivElement>(null);
  const collWrapRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const currentCollection = collectionOptions.find(o => o.id === collectionId) || null;

  // Auto-size the notes textarea: one line by default, growing with content and
  // capping at ~3 lines before it becomes scrollable. (Same idea as the full
  // view, which allows more lines because it has more room.)
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

  // Re-measure when the notes content changes (incl. when a new target re-seeds).
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
    collectionId
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
    setCollectionId(initialCollectionId ?? null);
    setOpenEditor(null);
    committedRef.current = false;
  }, [initialText, initialNotes, initialDate, initialStartTime, initialTime, initialPercent, initialXp, initialCollectionId]);

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

  // Close the open dropdown when clicking elsewhere. Native pickers are OS-level
  // overlays and don't dispatch mousedown to the document, so they stay open.
  useEffect(() => {
    if (!openEditor) return;
    const onDown = (e: MouseEvent) => {
      const wrap = openEditor === 'date' ? dateWrapRef.current
        : openEditor === 'time' ? timeWrapRef.current
          : openEditor === 'collection' ? collWrapRef.current
            : xpWrapRef.current;
      if (wrap && !wrap.contains(e.target as Node)) setOpenEditor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openEditor]);

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
      setTime('');
      setPercentStr('');
      setXpStr('');
      setCollectionId(null);
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

  const pct = percentStr === ''
    ? null
    : (Number.isInteger(+percentStr) ? +percentStr : Math.round(+percentStr));
  const xpVal = xpStr === '' ? null : Math.max(0, parseInt(xpStr) || 0);

  // Chips mirror the list-view time/percent badge: icon + mono value on a
  // low-opacity tint of the accent color, no border.
  const chipBase =
    'flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg cursor-pointer';
  const chipText =
    'flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium';
  const fieldBase =
    'bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-sm font-mono focus:outline-none focus:border-[var(--accent2)]';
  const popover =
    'absolute z-20 top-full left-0 mt-2 rounded-xl border border-white/10 bg-[#1f1f1f] shadow-2xl p-2';

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (openEditor) setOpenEditor(null); else cancel();
        }
      }}
      className="my-2 mx-4 p-3.5 bg-[#1A1A1A] border border-[var(--accent2)]/30 rounded-2xl shadow-xl"
    >
      <input
        ref={nameRef}
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Task name"
        className="w-full bg-transparent text-white text-base font-medium placeholder:text-white/30 focus:outline-none"
      />

      <textarea
        ref={notesRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onInput={resizeNotes}
        rows={1}
        placeholder="Add notes…"
        className="w-full bg-transparent resize-none text-white/70 text-sm leading-relaxed placeholder:text-white/25 focus:outline-none mt-2 overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/25"
      />

      {/* Chips — display only. Clicking opens a dropdown editor below the chip. */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {/* Date */}
        <div ref={dateWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => o === 'date' ? null : 'date')}
            className={`${chipBase} bg-[var(--accent2)]/7 hover:bg-[var(--accent2)]/15`}
          >
            <span className={`${chipText} text-[var(--accent2)]`}>
              <Calendar size={16} />
              <span className="relative top-px">{format(parseISO(date), 'MM/dd/yyyy')}</span>
            </span>
          </button>

          {openEditor === 'date' && (
            <div className={popover}>
              <input
                autoFocus
                type="date"
                value={date}
                onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                style={{ colorScheme: 'dark' }}
                className={`${fieldBase} w-[170px]`}
              />
            </div>
          )}
        </div>

        {/* Time + % */}
        <div ref={timeWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => o === 'time' ? null : 'time')}
            className={`${chipBase} ${time ? 'bg-[var(--accent1)]/7 hover:bg-[var(--accent1)]/15' : 'bg-white/5 hover:bg-white/10'}`}
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
              <span className={`${chipText} text-white/55`}>
                <Clock size={16} />
                <span className="relative top-px">Time</span>
              </span>
            )}
          </button>

          {openEditor === 'time' && (
            <div className={popover}>
              <div className="flex items-center gap-2">
                <div className="flex items-center h-9 bg-white/5 border border-white/10 rounded-lg focus-within:border-[var(--accent2)] overflow-hidden">
                  <input
                    autoFocus
                    type="time"
                    value={time}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="bg-transparent px-3 h-full text-white text-sm font-mono focus:outline-none w-[128px]"
                  />
                  <div className="w-px h-4 bg-white/15 shrink-0" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={percentStr}
                    onChange={(e) => handlePercentChange(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    placeholder="%"
                    className="bg-transparent px-3 h-full text-white text-sm font-mono focus:outline-none w-[78px]"
                  />
                </div>
                {(time || startTime) && (
                  <button
                    type="button"
                    onClick={() => { setStartTime(''); setTime(''); setPercentStr(''); setOpenEditor(null); }}
                    title="Clear"
                    className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/5"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* XP */}
        <div ref={xpWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => o === 'xp' ? null : 'xp')}
            className={`${chipBase} ${xpVal !== null ? 'bg-[#ffba44]/10 hover:bg-[#ffba44]/20' : 'bg-white/5 hover:bg-white/10'}`}
          >
            <span className={chipText} style={{ color: xpVal !== null ? GOLD : undefined }}>
              <Sparkles size={16} className={xpVal !== null ? '' : 'text-white/55'} />
              <span className={`relative top-px ${xpVal !== null ? '' : 'text-white/55'}`}>
                {xpVal !== null ? `${xpVal} XP` : 'XP'}
              </span>
            </span>
          </button>

          {openEditor === 'xp' && (
            <div className={popover}>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="1"
                  value={xpStr}
                  onChange={(e) => setXpStr(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  placeholder="XP"
                  className={`${fieldBase} w-[110px]`}
                />
                {xpStr !== '' && (
                  <button
                    type="button"
                    onClick={() => { setXpStr(''); setOpenEditor(null); }}
                    title="Clear"
                    className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/5"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collection */}
        <div ref={collWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => o === 'collection' ? null : 'collection')}
            style={currentCollection ? { backgroundColor: `${currentCollection.color || '#9ca3af'}14` } : undefined}
            className={`${chipBase} ${currentCollection ? '' : 'bg-white/5 hover:bg-white/10'}`}
          >
            <span
              className={`${chipText} max-w-[200px] ${currentCollection ? '' : 'text-white/55'}`}
              style={currentCollection ? { color: `color-mix(in srgb, ${currentCollection.color || '#9ca3af'} 60%, white)` } : undefined}
            >
              <Shapes size={16} className="shrink-0" />
              <span className="relative top-px truncate">
                {currentCollection ? currentCollection.path.map(p => p.name).join(' › ') : 'Collection'}
              </span>
            </span>
          </button>

          {openEditor === 'collection' && (
            <div className={`${popover} w-64`}>
              <CollectionSearchField
                value={collectionId}
                currentPath={currentCollection?.path || []}
                options={collectionOptions}
                onChange={setCollectionId}
                onCreate={(name) => (onCreateCollection ? onCreateCollection(name) : '')}
                autoFocus
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2.5">
        {mode === 'edit' && onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            title="Open full view"
            className="p-1.5 -ml-1 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-md"
          >
            <Maximize2 size={15} />
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={cancel}
          className="px-3 h-8 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg text-xs font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 h-8 bg-[var(--accent2)] hover:opacity-90 text-black font-bold rounded-lg text-xs disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {mode === 'add' ? 'Add task' : 'Save changes'}
        </button>
      </div>
    </div>
  );
};

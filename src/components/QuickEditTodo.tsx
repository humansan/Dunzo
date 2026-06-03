import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Sparkles, Maximize2, X, Tag as TagIcon } from 'lucide-react';
import { formatTime12h, timeToPercentage, percentageToTime } from '../utils/timeUtils';

export interface QuickEditValues {
  text: string;
  notes: string;
  date: string;            // YYYY-MM-DD
  startTime?: string;      // HH:MM
  endTime?: string;        // HH:MM
  percentageGoal?: number;
  xp?: number;
  tags?: string[];
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
  initialTags?: string[];
  allTags?: string[];               // every tag used across todos, for autocomplete
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
  initialTags,
  allTags = [],
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
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [tagInput, setTagInput] = useState('');

  // Which chip's dropdown editor is open (null = none)
  const [openEditor, setOpenEditor] = useState<'date' | 'time' | 'xp' | 'tags' | null>(null);
  const dateWrapRef = useRef<HTMLDivElement>(null);
  const timeWrapRef = useRef<HTMLDivElement>(null);
  const xpWrapRef = useRef<HTMLDivElement>(null);
  const tagsWrapRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Existing tags not yet on this todo, filtered by what's typed.
  const tagSuggestions = (() => {
    const current = new Set(tags);
    const q = tagInput.trim().toLowerCase();
    return allTags
      .filter(t => !current.has(t))
      .filter(t => !q || t.toLowerCase().includes(q));
  })();

  const addTagValue = (value: string) => {
    const t = value.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  // Enter selects the top suggestion when there is one; a brand-new tag is only
  // created when nothing matches what's typed.
  const addTag = () => {
    if (tagSuggestions.length > 0) addTagValue(tagSuggestions[0]);
    else addTagValue(tagInput);
  };

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag));

  const showTagPopup = openEditor === 'tags' && (tagSuggestions.length > 0 || tagInput.trim().length > 0);

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
    endTime: time || undefined,
    percentageGoal: percentStr ? parseFloat(percentStr) : undefined,
    xp: xpStr ? Math.max(0, parseInt(xpStr) || 0) : undefined,
    tags: tags.length ? tags : undefined
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
    setTags(initialTags || []);
    setTagInput('');
    setOpenEditor(null);
    committedRef.current = false;
  }, [initialText, initialNotes, initialDate, initialStartTime, initialTime, initialPercent, initialXp, initialTags]);

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
          : openEditor === 'tags' ? tagsWrapRef.current
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
      setTags([]);
      setTagInput('');
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

        {/* Tags */}
        <div ref={tagsWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpenEditor(o => o === 'tags' ? null : 'tags')}
            className={`${chipBase} ${tags.length ? 'bg-[var(--accent2)]/7 hover:bg-[var(--accent2)]/15' : 'bg-white/5 hover:bg-white/10'}`}
          >
            <span className={`${chipText} ${tags.length ? 'text-[var(--accent2)]' : 'text-white/55'} max-w-[200px]`}>
              <TagIcon size={16} className="shrink-0" />
              <span className="relative top-px truncate">
                {tags.length ? tags.join(', ') : 'Tags'}
              </span>
            </span>
          </button>

          {openEditor === 'tags' && (
            <div className={`${popover} w-64`}>
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[var(--accent2)]/15 text-[var(--accent2)] text-xs font-semibold"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-[var(--accent2)]/50 hover:text-[var(--accent2)] transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input
                  ref={tagInputRef}
                  autoFocus
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      e.stopPropagation();
                      addTag();
                    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  placeholder={tags.length ? 'Add…' : 'Add a tag…'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-sm focus:outline-none focus:border-[var(--accent2)]"
                />

                {/* Autocomplete popup — existing tags filtered as you type */}
                {showTagPopup && (
                  <div className="absolute z-10 top-full left-0 mt-2 w-full max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#222222] shadow-2xl p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {tagSuggestions.length > 0 ? (
                      tagSuggestions.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { addTagValue(tag); tagInputRef.current?.focus(); }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <TagIcon size={12} className="text-[var(--accent2)] shrink-0" />
                          <span className="truncate">{tag}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2.5 py-2 text-xs text-white/40 leading-relaxed">
                        Press <span className="text-white/70 font-semibold">Enter</span> to add new tag
                      </div>
                    )}
                  </div>
                )}
              </div>
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

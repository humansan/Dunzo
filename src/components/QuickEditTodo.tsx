import React, { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Maximize2 } from 'lucide-react';
import { formatTime12h, timeToPercentage, percentageToTime } from '../utils/timeUtils';

export interface QuickEditValues {
  text: string;
  notes: string;
  date: string;            // YYYY-MM-DD
  endTime?: string;        // HH:MM
  percentageGoal?: number;
}

interface QuickEditTodoProps {
  mode: 'add' | 'edit';
  initialText?: string;
  initialNotes?: string;
  initialDate: string;
  initialTime?: string;
  initialPercent?: number;
  onSubmit: (vals: QuickEditValues) => void;
  onCancel: () => void;
  onOpenFull?: () => void; // edit mode: jump to the full view
}

export const QuickEditTodo: React.FC<QuickEditTodoProps> = ({
  mode,
  initialText,
  initialNotes,
  initialDate,
  initialTime,
  initialPercent,
  onSubmit,
  onCancel,
  onOpenFull
}) => {
  const [text, setText] = useState(initialText || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime || '');
  const [percentStr, setPercentStr] = useState(initialPercent?.toString() ?? '');

  // Which chip's dropdown editor is open (null = none)
  const [openEditor, setOpenEditor] = useState<'date' | 'time' | null>(null);
  const dateWrapRef = useRef<HTMLDivElement>(null);
  const timeWrapRef = useRef<HTMLDivElement>(null);

  // Re-seed when the target changes (e.g. switching which todo is being edited)
  useEffect(() => {
    setText(initialText || '');
    setNotes(initialNotes || '');
    setDate(initialDate);
    setTime(initialTime || '');
    setPercentStr(initialPercent?.toString() ?? '');
    setOpenEditor(null);
  }, [initialText, initialNotes, initialDate, initialTime, initialPercent]);

  // Close the open dropdown when clicking elsewhere. Native date/time pickers are
  // OS-level overlays and don't dispatch mousedown to the document, so interacting
  // with the picker keeps the dropdown open.
  useEffect(() => {
    if (!openEditor) return;
    const onDown = (e: MouseEvent) => {
      const wrap = openEditor === 'date' ? dateWrapRef.current : timeWrapRef.current;
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
    onSubmit({
      text: text.trim(),
      notes: notes.trim(),
      date,
      endTime: time || undefined,
      percentageGoal: percentStr ? parseFloat(percentStr) : undefined
    });
  };

  const pct = percentStr === ''
    ? null
    : (Number.isInteger(+percentStr) ? +percentStr : Math.round(+percentStr));

  // Chips mirror the list-view time/percent badge exactly: icon + mono value on a
  // low-opacity tint of the accent color, no border.
  const chipBase =
    'flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg';
  const chipText =
    'flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium';
  const fieldBase =
    'bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-sm font-mono focus:outline-none focus:border-[var(--accent2)]';

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (openEditor) setOpenEditor(null); else onCancel();
        }
      }}
      className="p-3.5 bg-[#1A1A1A] border border-[var(--accent2)]/30 rounded-2xl shadow-xl"
    >
      <input
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Task name"
        className="w-full bg-transparent text-white text-base font-semibold placeholder:text-white/30 focus:outline-none"
      />

      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Description"
        className="w-full bg-transparent text-white/70 text-sm placeholder:text-white/25 focus:outline-none mt-1.5"
      />

      {/* Chips — display only. Clicking opens a dropdown editor below the chip. */}
      <div className="flex items-center gap-2 mt-3.5 flex-wrap">
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
            <div className="absolute z-20 top-full left-0 mt-2 rounded-xl border border-white/10 bg-[#1f1f1f] shadow-2xl p-2">
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
            <div className="absolute z-20 top-full left-0 mt-2 rounded-xl border border-white/10 bg-[#1f1f1f] shadow-2xl p-2">
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
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-3.5 pt-2.5 border-t border-white/5">
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
          onClick={onCancel}
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

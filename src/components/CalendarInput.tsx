import React, { useState, useEffect, useRef } from 'react';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { Calendar } from './Calendar';

interface CalendarInputProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  autoFocus?: boolean;
}

function toIso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// JS's Date constructor defaults to year 2001 when the input has no year
// (e.g. "July 3" or "7/3"). Detect a missing year and substitute the current one.
function parseInputDate(text: string): Date | null {
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  const hasYear = /\b\d{4}\b/.test(text) || /[\/\-\s]\d{2}$/.test(text);
  if (!hasYear) parsed.setFullYear(new Date().getFullYear());
  return parsed;
}

export const CalendarInput: React.FC<CalendarInputProps> = ({
  value,
  onChange,
  className,
  autoFocus,
}) => {
  const [text, setText] = useState(() => {
    if (!value) return '';
    const parsed = parseISO(value);
    return isValid(parsed) ? format(parsed, 'MM/dd/yyyy') : '';
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (!value) return new Date();
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : new Date();
  });

  useEffect(() => {
    if (value) {
      const parsed = parseISO(value);
      if (isValid(parsed)) {
        setText(format(parsed, 'MM/dd/yyyy'));
        setCurrentMonth(parsed);
        return;
      }
    }
    setText('');
  }, [value]);

  const commit = (raw: string) => {
    if (raw === '') {
      onChange('');
      return;
    }
    const parsed = parseInputDate(raw);
    if (parsed) {
      onChange(toIso(parsed));
      setCurrentMonth(parsed);
      setText(format(parsed, 'MM/dd/yyyy'));
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Just track what the user is typing — only parse on Enter so the parent
    // doesn't get intermediate values (and so the popover doesn't shift around
    // while the user is still typing).
    setText(e.target.value);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(text);
    }
  };

  const handleTextBlur = () => {
    if (value) {
      const parsed = parseISO(value);
      if (isValid(parsed)) {
        setText(format(parsed, 'MM/dd/yyyy'));
        return;
      }
    }
    setText('');
  };

  const handleDateClick = (d: Date) => {
    onChange(toIso(d));
    setCurrentMonth(d);
  };

  const setToday = () => handleDateClick(new Date());
  const setTomorrow = () => handleDateClick(addDays(new Date(), 1));
  const setNextWeek = () => handleDateClick(addDays(new Date(), 7));

  const handleClear = () => {
    onChange('');
    setText('');
  };

  const focusDate = value && isValid(parseISO(value)) ? parseISO(value) : new Date();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`bg-[#1A1A1A] border border-white/10 rounded-xl p-2.5 w-60 ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleTextKeyDown}
        onBlur={handleTextBlur}
        placeholder="MM/DD/YYYY"
        style={{ colorScheme: 'dark' }}
        className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white placeholder-white/30 focus:outline-none focus:border-(--accent2)/60 transition-colors"
      />
      <div className="grid grid-cols-3 gap-1 mt-1.5">
        <button
          onClick={setToday}
          className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-medium text-white/70 transition-colors"
        >
          Today
        </button>
        <button
          onClick={setTomorrow}
          className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-medium text-white/70 transition-colors"
        >
          Tomorrow
        </button>
        <button
          onClick={setNextWeek}
          className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-medium text-white/70 transition-colors"
        >
          Next Week
        </button>
      </div>
      <div className="mt-2">
        <Calendar
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onDateClick={handleDateClick}
          focusDate={focusDate}
        />
      </div>
      <button
        onClick={handleClear}
        className="w-full mt-2 pt-2 border-t border-white/10 text-xs font-bold text-white/40 hover:text-white transition-colors text-left"
      >
        Clear
      </button>
    </div>
  );
};

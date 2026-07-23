import React, { useState, useEffect, useRef } from 'react';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { Calendar } from '@/common/ui/Calendar';
import { Switch } from '@/common/ui/Switch';

interface CalendarInputProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  autoFocus?: boolean;
  /** Hide the Clear button where an empty date isn't a valid state for the task. */
  showClear?: boolean;
  showInDailyList?: boolean;
  onShowInDailyListChange?: (val: boolean) => void;
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
  showClear = true,
  showInDailyList = false,
  onShowInDailyListChange,
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
    if (showInDailyList) onShowInDailyListChange?.(false);
  };

  const focusDate = value && isValid(parseISO(value)) ? parseISO(value) : new Date();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  return (
    <div className={`bg-surface border border-line rounded-xl p-2.5 w-60 ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleTextKeyDown}
        onBlur={handleTextBlur}
        placeholder="MM/DD/YYYY"
                className="w-full bg-overlay border border-line rounded-lg px-2.5 py-1 text-sm text-fg placeholder:text-fg-faint focus:outline-none hover:border-line-strong focus:border-[var(--accent2)] transition-colors"
      />
      <div className="grid grid-cols-3 gap-1 mt-1.5">
        <button
          onClick={setToday}
          className="px-2 py-1 bg-fill-subtle hover:bg-fill rounded-md text-[10px] font-medium text-fg-muted transition-colors"
        >
          Today
        </button>
        <button
          onClick={setTomorrow}
          className="px-2 py-1 bg-fill-subtle hover:bg-fill rounded-md text-[10px] font-medium text-fg-muted transition-colors"
        >
          Tomorrow
        </button>
        <button
          onClick={setNextWeek}
          className="px-2 py-1 bg-fill-subtle hover:bg-fill rounded-md text-[10px] font-medium text-fg-muted transition-colors"
        >
          Next Week
        </button>
      </div>
      {onShowInDailyListChange && (
        <div className={`flex items-center justify-between mt-2 px-0.5 ${!value ? 'opacity-40' : ''}`}>
          <span className="text-[11px] text-fg-subtle">Send to daily list</span>
          <Switch
            checked={showInDailyList && !!value}
            disabled={!value}
            onChange={onShowInDailyListChange}
          />
        </div>
      )}
      <div className="mt-2">
        <Calendar
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onDateClick={handleDateClick}
          focusDate={focusDate}
        />
      </div>
      {showClear && (
        <button
          onClick={handleClear}
          className="w-full mt-2 pt-2 border-t border-line text-xs font-bold text-fg-faint hover:text-fg transition-colors text-left"
        >
          Clear
        </button>
      )}
    </div>
  );
};

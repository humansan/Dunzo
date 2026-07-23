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
  /** Auto-move-date toggle. Rendered only when the change handler is provided. */
  autoMoveDate?: boolean;
  onAutoMoveDateChange?: (val: boolean) => void;
}

function toIso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// JS's Date constructor defaults to year 2001 when the input has no year
// (e.g. "July 3" or "7/3"). Detect a missing year and substitute the current one.
function parseInputDate(text: string): Date | null {
  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  // A year is present when there's a 4-digit number, or a full month/day/year
  // triple (three numbers). The previous check looked for a trailing 2-digit
  // group, which also matched a zero-padded *day* - "07/03" or "July 03" were
  // read as having a year and left at 2001.
  const nums: string[] = text.match(/\d+/g) ?? [];
  const hasYear = nums.some((n) => n.length === 4) || nums.length >= 3;
  if (!hasYear) parsed.setFullYear(new Date().getFullYear());
  // Reject a typo'd year rather than commit it. "7/3/202" parses to year 202,
  // which would date the task ~1800 years back - and anything that later walks
  // day-by-day over history (streaks, stats) would iterate that entire span.
  // Treat an out-of-range year as unparseable so the input just reverts.
  const thisYear = new Date().getFullYear();
  const year = parsed.getFullYear();
  if (year < thisYear - 50 || year > thisYear + 50) return null;
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
  autoMoveDate = false,
  onAutoMoveDateChange,
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
    // Just track what the user is typing - only parse on Enter so the parent
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
    // Keep the showInDailyList flag: an undated task never reaches a daily list,
    // and re-adding a date later sends it straight back without re-toggling.
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
        <div className="flex items-center justify-between mt-2 px-0.5">
          <span className="flex flex-col">
            <span className="text-[11px] text-fg-subtle">Show in daily list</span>
            {showInDailyList && !value && (
              <span className="text-[10px] text-fg-faint">Applies once a date is set</span>
            )}
          </span>
          <Switch checked={showInDailyList} onChange={onShowInDailyListChange} />
        </div>
      )}
      {onAutoMoveDateChange && (
        <div className="flex items-center justify-between mt-2 px-0.5">
          <span className="flex flex-col">
            <span className="text-[11px] text-fg-subtle">Move forward if overdue</span>
            {/* <span className="text-[10px] text-fg-faint">Rolls forward to today until done</span> */}
          </span>
          <Switch checked={autoMoveDate} onChange={onAutoMoveDateChange} />
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

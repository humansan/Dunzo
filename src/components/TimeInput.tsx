import React, { useState, useEffect, useRef } from 'react';
import { timeToPercentage, percentageToTime, formatTime12h } from '../utils/timeUtils';

interface TimeInputProps {
  value?: string; // "HH:MM" (24h) or '' / undefined
  onChange: (val: string) => void; // emits "HH:MM" or '' to clear
  className?: string;
  autoFocus?: boolean;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── Parsing ──────────────────────────────────────────────────────────────────
// The text box accepts loose clock or percentage input. We classify it by the
// characters present: a ':' or an 'a'/'p' means a clock time; anything else is
// read as a percentage of the day. See parseInput for the combined ("|") form.

// "3a" → 03:00, "3:24p" → 15:24, "15:30" → 15:30, "330p" → 15:30. Null if junk.
function parseClock(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const am = s.includes('a');
  const pm = s.includes('p');
  const digits = s.replace(/[^0-9:]/g, '');
  if (!digits || digits === ':') return null;

  let h: number;
  let m: number;
  if (digits.includes(':')) {
    const [hp, mp] = digits.split(':');
    h = parseInt(hp || '0', 10);
    m = mp ? parseInt(mp.slice(0, 2), 10) : 0;
  } else if (digits.length <= 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else {
    // 3–4 bare digits read as H:MM / HH:MM (e.g. "930" → 9:30, "1230" → 12:30).
    h = parseInt(digits.slice(0, digits.length - 2), 10);
    m = parseInt(digits.slice(-2), 10);
  }
  if (isNaN(h) || isNaN(m)) return null;

  if (am || pm) {
    if (h < 1 || h > 12) return null;
    h = h % 12;
    if (pm) h += 12;
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// "54%", "23.4", "60" → the clock time at that fraction of the day. Null if junk.
function parsePercent(raw: string): string | null {
  const s = raw.replace(/%/g, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return percentageToTime(clamp01(n / 100) * 100) ?? null;
}

// Resolve the text box to a time. '' clears, null = unparseable (caller reverts).
// For the canonical "HH:MM AM/PM | ##%" form we honour whichever side the user
// edited (tracked via the last-rendered left/right), so editing either works.
function parseInput(
  raw: string,
  lastLeft: string,
  lastRight: string
): string | '' | null {
  const t = raw.trim();
  if (t === '') return '';
  if (t.includes('|')) {
    const [l, r] = t.split('|');
    const left = (l ?? '').trim();
    const right = (r ?? '').trim();
    const leftChanged = left !== lastLeft;
    const rightChanged = right !== lastRight;
    if (rightChanged && !leftChanged) return parsePercent(right);
    if (leftChanged && !rightChanged) return parseClock(left);
    return parseClock(left) ?? parsePercent(right);
  }
  if (/[:ap]/i.test(t)) return parseClock(t);
  return parsePercent(t);
}

// ── Display ──────────────────────────────────────────────────────────────────
function partsFor(time: string): { left: string; right: string } {
  const pct = timeToPercentage(time);
  return {
    left: formatTime12h(time),
    right: pct === undefined ? '' : `${Math.round(pct)}%`,
  };
}
const canonical = (time: string) => {
  const { left, right } = partsFor(time);
  return `${left} | ${right}`;
};

// "HH:MM" (24h) → 12-hour clock parts, and back.
function toClockParts(time: string): { h12: number; min: number; pm: boolean } {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const min = parseInt(mStr, 10);
  const pm = h >= 12;
  h = h % 12;
  if (h === 0) h = 12;
  return { h12: h, min, pm };
}
function fromClockParts(h12: number, min: number, pm: boolean): string {
  let h = h12 % 12;
  if (pm) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Column values, top → bottom (later time on top, earlier on the bottom).
const HOURS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MINUTES = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];

export const TimeInput: React.FC<TimeInputProps> = ({ value, onChange, className, autoFocus }) => {
  const [text, setText] = useState(() => (value ? canonical(value) : ''));
  // The exact left/right substrings last rendered — lets a commit tell which side
  // of the "time | %" string the user touched.
  const lastLeft = useRef('');
  const lastRight = useRef('');
  // While dragging the rail we preview locally and only commit on release, so a
  // drag doesn't fire a save on every mouse-move.
  const [preview, setPreview] = useState<string | null>(null);

  const setCanonical = (time: string) => {
    const { left, right } = partsFor(time);
    lastLeft.current = left;
    lastRight.current = right;
    setText(`${left} | ${right}`);
  };

  useEffect(() => {
    if (preview !== null) return; // mid-drag: don't fight the live preview
    if (value) setCanonical(value);
    else {
      lastLeft.current = '';
      lastRight.current = '';
      setText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  const commit = (raw: string) => {
    const result = parseInput(raw, lastLeft.current, lastRight.current);
    if (result === '') {
      onChange('');
      lastLeft.current = '';
      lastRight.current = '';
      setText('');
      return;
    }
    if (result == null) {
      // Unparseable — revert to the last good value.
      if (value) setCanonical(value);
      else setText('');
      return;
    }
    onChange(result);
    setCanonical(result);
  };

  const applyTime = (time: string) => {
    onChange(time);
    setCanonical(time);
  };

  const displayTime = preview ?? (value || null);
  const cur = displayTime ? toClockParts(displayTime) : null;

  // ── Stepped column pickers (hour / minute) ─────────────────────────────────
  // Each column is 12 equal cells. Dragging snaps to a cell (hour 1–12, minute
  // in 5s); the other two parts are held fixed for the duration of the drag.
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  const startColumnDrag = (
    e: React.MouseEvent,
    kind: 'hour' | 'minute',
    colRef: React.RefObject<HTMLDivElement>
  ) => {
    e.preventDefault();
    const base = cur ?? { h12: 12, min: 0, pm: false };
    const timeFromY = (clientY: number): string | null => {
      const el = colRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const r = clamp01((clientY - rect.top) / rect.height);
      const i = Math.min(11, Math.floor(r * 12)); // cell index from the top
      return kind === 'hour'
        ? fromClockParts(12 - i, base.min, base.pm)
        : fromClockParts(base.h12, (11 - i) * 5, base.pm);
    };
    const first = timeFromY(e.clientY);
    if (first) { setPreview(first); setText(canonical(first)); }
    const move = (ev: MouseEvent) => {
      const t = timeFromY(ev.clientY);
      if (t) { setPreview(t); setText(canonical(t)); }
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const t = timeFromY(ev.clientY) ?? first;
      setPreview(null);
      if (t) applyTime(t);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const setMeridiem = (pm: boolean) => {
    const base = cur ?? { h12: 12, min: 0, pm };
    applyTime(fromClockParts(base.h12, base.min, pm));
  };

  // Marker-line positions (continuous, clamped so a typed odd value stays visible).
  const hourLineFrac = cur ? clamp01((0.5 + (12 - cur.h12)) / 12) : null;
  const minLineFrac = cur ? clamp01((0.5 + (55 - cur.min) / 5) / 12) : null;
  const curMin5 = cur ? (Math.round(cur.min / 5) * 5) % 60 : null;

  // One stepped column: 12 centered labels + the accent marker line.
  const renderRail = (
    colRef: React.RefObject<HTMLDivElement>,
    items: number[],
    activeValue: number | null,
    lineFrac: number | null,
    onDown: (e: React.MouseEvent) => void,
    fmt: (v: number) => string
  ) => (
    <div
      ref={colRef}
      onMouseDown={onDown}
      className="relative h-[200px] rounded-lg border border-white/10 cursor-pointer select-none overflow-hidden"
    >
      {/* Marker line drawn first so the labels paint on top and stay readable. */}
      {lineFrac != null && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-[#d93d42] pointer-events-none"
          style={{ top: `${lineFrac * 100}%`, transform: 'translateY(-50%)' }}
        />
      )}
      {items.map((v, i) => {
        const active = v === activeValue;
        return (
          <span
            key={v}
            className={`absolute left-0 right-0 text-center text-[11px] pointer-events-none transition-colors ${
              active ? 'text-white font-bold' : 'text-white/40'
            }`}
            style={{ top: `${((i + 0.5) / 12) * 100}%`, transform: 'translateY(-50%)' }}
          >
            {fmt(v)}
          </span>
        );
      })}
    </div>
  );

  const presets: { label: string; time: string }[] = [
    { label: 'Noon', time: '12:00' },
    { label: 'Midnight', time: '00:00' },
  ];

  return (
    <div className={`bg-[#1A1A1A] border border-white/10 rounded-xl p-2.5 w-60 ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
        }}
        onBlur={() => commit(text)}
        placeholder="e.g. 9a or 3:24 PM or 54%"
        style={{ colorScheme: 'dark' }}
        className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-2.5 py-1 text-sm text-white placeholder:text-white/35 focus:outline-none hover:border-white/20 focus:border-[var(--accent2)] transition-colors"
      />

      <div className="grid grid-cols-2 gap-1 mt-1.5">
        {presets.map((p) => (
          <button
            key={p.time}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyTime(p.time)}
            className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-medium text-white/70 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stepped pickers: hour (1–12) · minute (in 5s) · AM/PM. Equal columns,
          earlier time at the bottom. Click or drag a column to set it. */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {renderRail(
          hourRef,
          HOURS,
          cur?.h12 ?? null,
          hourLineFrac,
          (e) => startColumnDrag(e, 'hour', hourRef),
          (v) => `${v}`
        )}
        {renderRail(
          minuteRef,
          MINUTES,
          curMin5,
          minLineFrac,
          (e) => startColumnDrag(e, 'minute', minuteRef),
          (v) => String(v).padStart(2, '0')
        )}
        <div className="flex flex-col gap-1.5">
          {([['AM', false], ['PM', true]] as const).map(([label, isPM]) => {
            const active = cur ? cur.pm === isPM : false;
            return (
              <button
                key={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMeridiem(isPM)}
                className={`rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                  active
                    ? 'bg-[#d93d42] border-transparent text-white'
                    : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { onChange(''); lastLeft.current = ''; lastRight.current = ''; setText(''); }}
        className="w-full mt-2 pt-2 border-t border-white/10 text-xs font-bold text-white/40 hover:text-white transition-colors text-left"
      >
        Clear
      </button>
    </div>
  );
};

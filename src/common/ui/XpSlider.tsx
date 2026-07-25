import React, { useState, useRef, useEffect } from 'react';
import { Astroid } from 'lucide-react';
import { useThemeColor } from '@/theme/useThemeColor';

// The XP/streak gold, matching StarStreak.
const STEP = 1;
const MIN = STEP;
const MAX = 10;
// One icon per step - the row is still five icons, they're just worth 10 each.
const COUNT = MAX / STEP;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface XpSliderProps {
  /** Current XP; undefined = unset. When set it is constrained to 1–10 in 1s. */
  value?: number;
  onChange: (val: number | undefined) => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The XP editor panel - a row of five Astroid icons that fill (gold) up to the
 * selected value, click or drag to set 1–10 in steps of 1, plus a Clear button
 * to unset. Own
 * shell, mirroring the TimeInput / CalendarInput popover panels; hosted by any
 * anchored-popover shell (taskChips' ChipPopover, the table's CellEditorPopover).
 */
export const XpSlider: React.FC<XpSliderProps> = ({ value, onChange, autoFocus, className }) => {
  const GOLD = useThemeColor('xp-tier1');
  const rowRef = useRef<HTMLDivElement>(null);
  // Local override of `value`, held while dragging AND after the commit until the
  // parent echoes the new value back. The echo can be a tick late - react-query
  // applies its optimistic cache write asynchronously - so releasing the override
  // on mouse-up paints one frame of the *old* XP before the new one lands. The
  // wrapper object lets `{ value: undefined }` mean "cleared" rather than "no override".
  const [preview, setPreview] = useState<{ value?: number } | null>(null);
  const dragging = useRef(false);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) rootRef.current?.focus();
  }, [autoFocus]);

  // The parent has spoken: drop the override. Only fires when `value` truly changes,
  // so a mid-drag preview is never disturbed.
  useEffect(() => {
    if (!dragging.current) setPreview(null);
  }, [value]);

  const commit = (v: number | undefined) => {
    setPreview({ value: v });
    onChange(v);
  };

  const current = preview ? preview.value : value;
  // How many ICONS paint filled (not the XP value). Rounding up means an
  // off-step or legacy 1-5 value still lights at least one icon rather than
  // reading as empty; clamping is display-only, the stored value isn't changed
  // until the user interacts.
  const filled =
    current === undefined ? 0 : Math.max(0, Math.min(COUNT, Math.ceil(current / STEP)));

  // Map a pointer x within the row to a value in 1–10, on the step.
  const valueFromX = (clientX: number): number => {
    const el = rowRef.current;
    if (!el) return MIN;
    const rect = el.getBoundingClientRect();
    const f = clamp01((clientX - rect.left) / rect.width);
    return Math.min(MAX, Math.max(MIN, Math.ceil(f * COUNT) * STEP));
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setPreview({ value: valueFromX(e.clientX) });
    const move = (ev: MouseEvent) => setPreview({ value: valueFromX(ev.clientX) });
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dragging.current = false;
      // commit keeps the preview up until the parent echoes the new value back.
      commit(valueFromX(ev.clientX));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={`bg-surface border border-line rounded-xl p-2.5 w-64 focus:outline-none ${className ?? ''}`}
    >
      <div className="flex items-center gap-1.5 px-0.5 mb-2 text-sm font-mono">
        <Astroid size={14} strokeWidth={2.5} style={{ color: filled > 0 ? GOLD : undefined }} className={filled > 0 ? '' : 'text-fg-subtle'} />
        <span className={filled > 0 ? 'text-fg' : 'text-fg-faint'}>
          {current !== undefined ? `${current} xp` : 'Set xp'}
        </span>
      </div>

      {/* The rating row acts as a slider: click an icon or drag across the row. */}
      <div ref={rowRef} onMouseDown={startDrag} className="flex items-end justify-between cursor-pointer select-none">
        {Array.from({ length: COUNT }, (_, i) => {
          const v = (i + 1) * STEP;
          const on = i < filled;
          return (
            <div key={v} className="flex flex-col items-center gap-0.5">
              <Astroid
                size={18}
                strokeWidth={2.5}
                fill={on ? GOLD : 'transparent'}
                style={{ color: on ? GOLD : undefined }}
                className={on ? '' : 'text-fg-faint'}
              />
              <span className={`text-[10px] leading-none ${v === current ? 'text-fg font-bold' : 'text-fg-faint'}`}>{v}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(undefined)}
        className="w-full mt-2 pt-2 border-t border-line text-xs font-bold text-fg-faint hover:text-fg transition-colors text-left"
      >
        Clear
      </button>
    </div>
  );
};

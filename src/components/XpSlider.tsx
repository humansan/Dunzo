import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Astroid } from 'lucide-react';

// The XP/streak gold, matching StarStreak.
const GOLD = '#ffc24b';
const MIN = 1;
const MAX = 10;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface XpSliderProps {
  /** Current XP; undefined = unset. When set it is constrained to 1–10. */
  value?: number;
  onChange: (val: number | undefined) => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The XP editor panel — a row of ten Astroid icons that fill (gold) up to the
 * selected value, click or drag to set 1–10, plus a Clear button to unset. Own
 * shell, mirroring the TimeInput / CalendarInput popover panels; hosted by
 * XpSliderPopover or any anchored-popover shell (e.g. the table's CellEditorPopover).
 */
export const XpSlider: React.FC<XpSliderProps> = ({ value, onChange, autoFocus, className }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  // While dragging we preview locally and only commit the value on each step so
  // the row tracks the cursor without waiting for the parent to echo it back.
  const [preview, setPreview] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) rootRef.current?.focus();
  }, [autoFocus]);

  const current = preview ?? value;
  // How many icons paint filled: clamp legacy/out-of-range values to [0, 10] for
  // display only (the stored value isn't changed until the user interacts).
  const filled = current === undefined ? 0 : Math.max(0, Math.min(MAX, current));

  // Map a pointer x within the row to a value in 1–10.
  const valueFromX = (clientX: number): number => {
    const el = rowRef.current;
    if (!el) return MIN;
    const rect = el.getBoundingClientRect();
    const f = clamp01((clientX - rect.left) / rect.width);
    return Math.min(MAX, Math.max(MIN, Math.ceil(f * MAX)));
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const first = valueFromX(e.clientX);
    setPreview(first);
    const move = (ev: MouseEvent) => setPreview(valueFromX(ev.clientX));
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const v = valueFromX(ev.clientX);
      setPreview(null);
      onChange(v);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={`bg-surface border border-line rounded-xl p-2.5 w-60 focus:outline-none ${className ?? ''}`}
    >
      <div className="flex items-center gap-1.5 px-0.5 mb-2 text-sm font-mono">
        <Astroid size={14} strokeWidth={2.5} style={{ color: filled > 0 ? GOLD : undefined }} className={filled > 0 ? '' : 'text-fg-subtle'} />
        <span className={filled > 0 ? 'text-fg' : 'text-fg-faint'}>
          {value !== undefined ? `${value} XP` : 'Set XP'}
        </span>
      </div>

      {/* The rating row acts as a slider: click an icon or drag across the row. */}
      <div ref={rowRef} onMouseDown={startDrag} className="flex items-end justify-between cursor-pointer select-none">
        {Array.from({ length: MAX }, (_, i) => {
          const v = i + 1;
          const on = v <= filled;
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
        onClick={() => onChange(undefined)}
        className="w-full mt-2 pt-2 border-t border-line text-xs font-bold text-fg-faint hover:text-fg transition-colors text-left"
      >
        Clear
      </button>
    </div>
  );
};

// Matches the XpSlider panel width (w-60 = 15rem).
const POPOVER_WIDTH = 240;
const MARGIN = 8;

interface XpSliderPopoverProps {
  value?: number;
  onChange: (val: number | undefined) => void;
  /** Extra classes for the anchor wrapper (e.g. `w-full`). */
  className?: string;
  /** Renders the trigger; `open` opens the popover. */
  children: (args: { open: () => void; isOpen: boolean }) => React.ReactNode;
}

/**
 * Anchors the XpSlider panel to an arbitrary trigger, handling the body portal,
 * viewport-aware placement (flips above when it would overflow the bottom), and
 * outside-click / Escape dismissal. Cloned from DatePickerPopover.
 */
export const XpSliderPopover: React.FC<XpSliderPopoverProps> = ({ value, onChange, className, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popH = popoverRef.current?.offsetHeight ?? 0;

    let left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN);
    left = Math.max(MARGIN, left);

    let top = rect.bottom + 4;
    if (popH && top + popH > window.innerHeight - MARGIN) {
      const above = rect.top - popH - 4;
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - popH - MARGIN);
    }
    setPos({ top, left });
  }, []);

  const open = useCallback(() => {
    setPos(null); // re-measure on each open
    setIsOpen(true);
  }, []);

  useLayoutEffect(() => {
    if (isOpen) updatePos();
  }, [isOpen, updatePos]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isOpen, updatePos]);

  return (
    <div ref={anchorRef} className={`relative ${className ?? ''}`}>
      {children({ open, isOpen })}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[80]"
          >
            <XpSlider value={value} onChange={onChange} autoFocus />
          </div>,
          document.body,
        )}
    </div>
  );
};

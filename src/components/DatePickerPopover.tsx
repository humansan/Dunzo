import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarInput } from './CalendarInput';

interface DatePickerPopoverProps {
  /** Selected date as a `yyyy-MM-dd` string (empty string = no date). */
  value: string;
  onChange: (val: string) => void;
  /** Optional task-mode toggle, forwarded to CalendarInput. */
  showInDailyList?: boolean;
  onShowInDailyListChange?: (val: boolean) => void;
  /** Extra classes for the anchor wrapper (e.g. `w-full`). */
  className?: string;
  /** Renders the trigger; `open` opens the popover. */
  children: (args: { open: () => void; isOpen: boolean }) => React.ReactNode;
}

// Matches CalendarInput's panel width (w-60 = 15rem).
const POPOVER_WIDTH = 240;
const MARGIN = 8;

/**
 * Anchors the shared CalendarInput panel to an arbitrary trigger, handling the
 * body portal, viewport-aware placement (flips above when it would overflow the
 * bottom), and outside-click / Escape dismissal. This is the generic glue that
 * lets CalendarInput stand in for the browser's native date picker anywhere.
 */
export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  value,
  onChange,
  showInDailyList,
  onShowInDailyListChange,
  className,
  children,
}) => {
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

  // Measure once the panel is mounted so placement can account for its height.
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
            className="z-[60]"
          >
            <CalendarInput
              value={value}
              onChange={onChange}
              autoFocus
              showInDailyList={showInDailyList}
              onShowInDailyListChange={onShowInDailyListChange}
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

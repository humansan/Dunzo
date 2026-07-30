import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { Calendar, Clock, Astroid, GitBranch } from 'lucide-react';
import { formatTime12h } from '@/common/lib/time';
import { collectionOf, percentOfDay, percentLabel } from '@/features/tasks/model';
import { Todo } from '@shared/types';
import {
  OptionSelectField,
  OptionChip,
  ChipOption,
} from '@/features/tasks/fields';
import { CalendarInput } from '@/common/ui';
import { TimeInput } from '@/common/ui';
import { XpSlider } from '@/common/ui';
import { TaskFinder } from '@/features/planner/task-finder';
import { useAppData } from '@/lib/app-data';
import { btnGhost } from '@/theme/buttons';

// ── Shared chip recipes ──────────────────────────────────────────────────────
// Tinted, fixed-height chips (date / time / xp) and the left-aligned hover-lit
// rowBtn used by the option / collection / parent buttons.
export const chipBase =
  'flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg cursor-pointer';
export const chipDeactivated = 'flex items-center justify-center gap-2 px-2.75 py-[5.5px] rounded-lg cursor-not-allowed';
export const chipText =
  'flex items-center justify-center gap-1.5 text-[13px] leading-none font-mono font-medium';
export const rowBtn =
  'flex items-center gap-1.5 px-2 h-[27px] rounded-lg cursor-pointer text-[13px] leading-none font-mono font-medium min-w-0 max-w-full overflow-hidden ' + btnGhost();
// Shell for panels that don't bring their own (OptionSelectField).
export const chipPopoverCls = 'rounded-xl border border-line bg-surface shadow-2xl p-2';

const MARGIN = 8;

/**
 * The anchored popover shell behind every chip. Portals to document.body so it is
 * never clipped by a scrolling ancestor (e.g. TodoFullView's properties sidebar),
 * places itself under the trigger and flips above when it would overflow, and
 * dismisses on outside-click / Escape.
 *
 * Because React portals bubble events through the React tree (not the DOM), Enter
 * and Escape are stopped here - otherwise a keypress inside a popover would submit
 * the quick-edit panel or close the full-view modal.
 */
export const ChipPopover: React.FC<{
  /** Panel width, used only for placement math; the panel sets its own width class. */
  width?: number;
  /** Extra classes for the anchor wrapper. */
  className?: string;
  /** `close` lets selection panels dismiss themselves on pick. */
  panel: (close: () => void) => React.ReactNode;
  children: (args: { open: () => void; isOpen: boolean }) => React.ReactNode;
}> = ({ width = 240, className, panel, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  // The trigger toggles. The outside-click handler ignores targets inside the
  // anchor, so a click on the trigger never reaches it - the trigger has to close
  // the popover itself, or it can only ever be dismissed by clicking elsewhere.
  const open = useCallback(() => setIsOpen((v) => !v), []);

  const updatePos = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // A detached / not-yet-laid-out anchor reports an all-zero rect; measuring off
    // it clamps the panel to a viewport edge (the "snap to the side"). Skip such a
    // frame and keep the last good position.
    if (rect.width === 0 && rect.height === 0) return;
    const popH = popoverRef.current?.offsetHeight ?? 0;

    let left = Math.min(rect.left, window.innerWidth - width - MARGIN);
    left = Math.max(MARGIN, left);

    let top = rect.bottom + 4;
    if (popH && top + popH > window.innerHeight - MARGIN) {
      const above = rect.top - popH - 4;
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - popH - MARGIN);
    }
    setPos({ top, left });
  }, [width]);

  // Measure while open until a position lands. Gating on `pos === null` (rather than
  // only the open→true edge) means a re-open always re-measures even if `isOpen`
  // never flipped off, so the panel can't get stuck hidden - visibility keys off `pos`.
  useLayoutEffect(() => {
    if (isOpen && pos === null) updatePos();
  }, [isOpen, pos, updatePos]);

  // Drop the measured position on close so the next open re-measures from scratch
  // instead of flashing at the previous (possibly stale / edge-clamped) spot.
  useEffect(() => {
    if (!isOpen) setPos(null);
  }, [isOpen]);

  // A panel whose content shrinks (e.g. the collection list as the search
  // narrows) would otherwise keep its measured `top`. Below the anchor that's
  // fine, but a panel flipped ABOVE is bottom-aligned to the trigger, so its
  // bottom edge would lift away and leave a gap. Re-place it on every resize.
  useEffect(() => {
    const el = popoverRef.current;
    if (!isOpen || !el) return;
    const ro = new ResizeObserver(() => updatePos());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, updatePos]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isOpen, updatePos]);

  // Contain Enter/Escape while open, whether focus sits on the trigger or inside
  // the portaled panel (both bubble to the host through the React tree).
  const containKeys = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Enter') e.stopPropagation();
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };

  return (
    <div ref={anchorRef} onKeyDown={containKeys} className={`relative ${className ?? ''}`}>
      {children({ open, isOpen })}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            onKeyDown={containKeys}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[80]"
          >
            {panel(close)}
          </div>,
          document.body,
        )}
    </div>
  );
};

// ── Date ─────────────────────────────────────────────────────────────────────
export const DateChip: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  showInDailyList?: boolean;
  onShowInDailyListChange?: (val: boolean) => void;
  autoMoveDate?: boolean;
  onAutoMoveDateChange?: (val: boolean) => void;
}> = ({ value, onChange, placeholder = 'Date', showInDailyList, onShowInDailyListChange, autoMoveDate, onAutoMoveDateChange }) => (
  <ChipPopover
    panel={() => (
      <CalendarInput
        value={value}
        autoFocus
        onChange={onChange}
        showInDailyList={showInDailyList}
        onShowInDailyListChange={onShowInDailyListChange}
        autoMoveDate={autoMoveDate}
        onAutoMoveDateChange={onAutoMoveDateChange}
      />
    )}
  >
    {({ open }) => (
      <button
        type="button"
        onClick={open}
        className={`${chipBase} ${value ? 'bg-[var(--accent2)]/7 hover:bg-[var(--accent2)]/15' : 'bg-fill-subtle hover:bg-fill'}`}
      >
        <span className={`${chipText} ${value ? 'text-[var(--accent2)]' : 'text-fg-subtle'}`}>
          <Calendar size={16} />
          <span className="relative top-px">{value ? format(parseISO(value), 'MM/dd/yyyy') : placeholder}</span>
        </span>
      </button>
    )}
  </ChipPopover>
);

// ── Time (+ optional percent-of-day readout) ─────────────────────────────────
export const TimeChip: React.FC<{
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
  /** A time can't exist without a date on its side; the caller disables the chip
   *  (greyed, non-interactive) until that side has a date. */
  disabled?: boolean;
  /** Drops the accent tint but stays clickable - the daily list uses it to grey
   *  the chip on a completed task. */
  muted?: boolean;
}> = ({ value, onChange, placeholder = 'Time', disabled = false, muted = false }) => {
  // The percent half is derived here rather than passed in: it IS the time, shown
  // differently, so there's no second value for a caller to get wrong.
  const pct = percentLabel(percentOfDay(value));
  const tone = muted ? 'text-fg-ghost' : 'text-[var(--accent1)]';
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title="Add a date first"
        className={`${chipDeactivated} bg-fill-subtle opacity-40`}
      >
        <span className={`${chipText} text-fg-subtle`}>
          <Clock size={16} />
          <span className="relative top-px">{value ? formatTime12h(value) : placeholder}</span>
        </span>
      </button>
    );
  }
  return (
    <ChipPopover panel={() => <TimeInput value={value} autoFocus onChange={onChange} />}>
      {({ open }) => (
        <button
          type="button"
          onClick={open}
          className={`${chipBase} ${
            muted || !value
              ? 'bg-fill-subtle hover:bg-fill'
              : 'bg-[var(--accent1)]/7 hover:bg-[var(--accent1)]/15'
          }`}
        >
          {value ? (
            <>
              <span className={`${chipText} ${tone}`}>
                <Clock size={16} />
                <span className="relative top-px">{formatTime12h(value)}</span>
              </span>
              {pct && (
                <>
                  <div className={`w-px h-4 ${muted ? 'bg-fill' : 'bg-[var(--accent1)]/20'}`} />
                  <span className={`${chipText} ${tone}`}>
                    <span className="relative top-px">{pct}</span>
                  </span>
                </>
              )}
            </>
          ) : (
            <span className={`${chipText} text-fg-subtle`}>
              <Clock size={16} />
              <span className="relative top-px">{placeholder}</span>
            </span>
          )}
        </button>
      )}
    </ChipPopover>
  );
};

// ── XP ───────────────────────────────────────────────────────────────────────
export const XpChip: React.FC<{
  value?: number;
  onChange: (val: number | undefined) => void;
  /** Drops the gold tint but stays clickable - the daily list uses it to grey the
   *  chip on a completed task. */
  muted?: boolean;
}> = ({ value, onChange, muted = false }) => {
  const set = value !== undefined;
  const dim = muted ? 'text-fg-ghost' : 'text-fg-subtle';
  return (
    <ChipPopover panel={() => <XpSlider value={value} autoFocus onChange={onChange} />}>
      {({ open }) => (
        <button
          type="button"
          onClick={open}
          className={`${chipBase} ${
            muted
              ? 'bg-fill-subtle hover:bg-fill text-fg-ghost'
              : set
                ? 'bg-warning/10 text-warning hover:bg-warning/18'
                : 'bg-fill-subtle hover:bg-fill'
          }`}
        >
          <span className={chipText}>
            <Astroid size={16} className={set && !muted ? '' : dim} />
            <span className={`relative top-px ${set && !muted ? '' : dim}`}>{set ? `${value} xp` : 'xp'}</span>
          </span>
        </button>
      )}
    </ChipPopover>
  );
};

// ── Status / Priority ────────────────────────────────────────────────────────
// A hover-lit rowBtn holding the field icon + the shared rounded OptionChip pill
// (the same pill the table and full view use), or a muted label when unset.
export const OptionChipButton: React.FC<{
  icon: React.ReactNode;
  placeholder: string;
  value?: string;
  option?: ChipOption;
  options: ChipOption[];
  onChange: (val: string | undefined) => void;
}> = ({ icon, placeholder, value, option, options, onChange }) => (
  <ChipPopover
    width={192}
    panel={(close) => (
      <div className={`${chipPopoverCls} w-48`}>
        <OptionSelectField options={options} value={value} onChange={(v) => { onChange(v); close(); }} />
      </div>
    )}
  >
    {({ open }) => (
      <button type="button" onClick={open} className={rowBtn}>
        {icon}
        {option ? <OptionChip option={option} /> : <span className="text-fg-subtle">{placeholder}</span>}
      </button>
    )}
  </ChipPopover>
);

// ── Parent task ──────────────────────────────────────────────────────────────
export const ParentTaskButton: React.FC<{
  /** The edited task; it and its subtree are excluded so a pick can't make a cycle. */
  todoId?: string;
  parentId: string | null;
  onChange: (id: string | null) => void;
}> = ({ todoId, parentId, onChange }) => {
  const { searchEntries, todoById, handleHubSaveTodo, handleToggleTodo } = useAppData();
  const [pickerOpen, setPickerOpen] = useState(false);

  const parentTodo = parentId ? todoById.get(parentId) ?? null : null;
  const parentTaskName = parentTodo && !parentTodo.isCollection ? (parentTodo.text || 'Untitled') : null;

  const isDisabled = (id: string): boolean => {
    if (!todoId) return false;
    if (id === todoId) return true;
    let p = todoById.get(id)?.parentId ?? null;
    const seen = new Set<string>();
    while (p && todoById.has(p) && !seen.has(p)) {
      if (p === todoId) return true;
      seen.add(p);
      p = todoById.get(p)!.parentId ?? null;
    }
    return false;
  };

  return (
    <>
      <button type="button" onClick={() => setPickerOpen(true)} className={rowBtn}>
        <GitBranch size={16} className="shrink-0 text-fg-subtle" />
        {parentTaskName
          ? <span className="min-w-0 truncate text-fg">{parentTaskName}</span>
          : <span className="text-fg-subtle">Set parent task</span>}
      </button>
      {pickerOpen && (
        <TaskFinder
          entries={searchEntries}
          todoById={todoById}
          onSaveTodo={handleHubSaveTodo}
          onToggleTodo={handleToggleTodo}
          title="Set parent task"
          placeholder="Search for a task to nest under…"
          isDisabled={isDisabled}
          rootOption={{ label: 'Set no parent', onSelect: () => { onChange(null); setPickerOpen(false); } }}
          onPick={(id) => { onChange(id); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};

/**
 * The collection a task belongs to, given its immediate parent: the parent itself
 * when it is a collection, otherwise the nearest collection above it. `parentId` is
 * a single field shared by task-nesting and collection membership.
 */
export function derivedCollectionId(parentId: string | null, todoById: Map<string, Todo>): string | null {
  if (!parentId) return null;
  const parent = todoById.get(parentId);
  if (!parent) return null;
  return parent.isCollection ? parent.id : collectionOf(parent, todoById);
}

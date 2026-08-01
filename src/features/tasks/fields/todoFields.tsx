import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Circle, Check, ChevronRight } from 'lucide-react';
import CheckCircleCutout from '@/assets/CheckCircleCutout';
import { percentageToTime } from '@/common/lib/time';
import { TodoStatus, TodoPriority } from '@shared/types';
import { pill } from '@/theme/pill';
import { collectionColor } from '@/theme/collectionColor';

// ── Shared todo field editors ────────────────────────────────────────────────
// Small controlled inputs for each todo field, shared by the full-view panel and
// the Task Planner spreadsheet so the editing behaviour stays identical in both.
// The time/percent fields encapsulate the start↔end↔% sync and emit a patch.

// Patch shape emitted by the time/percent fields (a subset of Todo).
export interface TimePatch {
  startTime?: string;
  dueTime?: string;
}

// Which of the two times an edit targets.
export type TimeKind = 'start' | 'due';

// The time is the only stored value; its percent-of-day is derived for display
// (see model/percent.ts). So both editors emit the same one-key patch, and there
// is nothing left that can fall out of sync. '' clears.
export const patchFromTime = (kind: TimeKind, time: string): TimePatch =>
  kind === 'start' ? { startTime: time || undefined } : { dueTime: time || undefined };

// A percent edit is a time edit expressed differently: it snaps to the nearest
// minute (33% → 07:55). An out-of-range percent has no time to snap to, so it's
// a no-op - an empty patch leaves the time exactly as it was.
export const patchFromPercent = (kind: TimeKind, pct: number | undefined): TimePatch => {
  if (pct === undefined) return patchFromTime(kind, '');
  const time = percentageToTime(pct);
  return time === undefined ? {} : patchFromTime(kind, time);
};

// Default look for the boxed inputs (date/time/percent/xp). Callers can override.
export const fieldInputClass =
  'bg-fill-subtle border border-line rounded-lg px-3 h-9 text-fg text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors';

// ── Completion toggle ────────────────────────────────────────────────────────
export const CompletedToggle: React.FC<{
  completed: boolean;
  // Omitted → read-only check (no click, no hover lit): the Task Finder's results.
  onToggle?: () => void;
  size?: number;
  className?: string;
}> = ({ completed, onToggle, size = 22, className = '' }) => (
  <button
    onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
    className={`shrink-0 ${onToggle ? 'cursor-pointer' : 'cursor-default'} ${className}`}
  >
    <motion.div
      animate={completed ? { scale: [1.3, 1], rotate: [15, 0] } : {}}
      transition={{ duration: 0.3 }}
      className={`transition-colors duration-200 ${completed ? 'text-[var(--accent1)]' : `text-fg-subtle ${onToggle ? 'hover:text-fg' : ''}`}`}
    >
      {completed
        ? <CheckCircleCutout size={size} strokeWidth={2.5} />
        : <Circle size={size} strokeWidth={2.5} />}
    </motion.div>
  </button>
);

// ── Percent of day (an editor for the time, in percent form) ─────────────────
// `value` is the DERIVED percent (see model/percent.ts), so a keystroke round-trips
// through the time: 33 → 07:55 → 32.99. Echoing that straight back into the box
// would rewrite the digits under the caret mid-typing, so the field keeps its own
// draft text while focused and re-syncs from `value` only once it's left alone.
export const PercentField: React.FC<{
  kind: TimeKind;
  value?: number;
  onChange: (patch: TimePatch) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  placeholder?: string;
}> = ({ kind, value, onChange, className, autoFocus, onBlur, placeholder = 'e.g. 50' }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(Math.round(value)));

  return (
    <input
      type="number"
      min="0"
      max="100"
      step="any"
      value={shown}
      autoFocus={autoFocus}
      onBlur={() => { setDraft(null); onBlur?.(); }}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        if (val === '') { onChange(patchFromPercent(kind, undefined)); return; }
        const num = parseFloat(val);
        if (!isNaN(num)) onChange(patchFromPercent(kind, num));
      }}
      placeholder={placeholder}
      className={className ?? fieldInputClass}
    />
  );
};

// ── Notes (auto-growing textarea) ────────────────────────────────────────────
export const NotesField: React.FC<{
  value: string;
  onChange: (val: string) => void;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}> = ({
  value,
  onChange,
  minHeight = 24,
  maxHeight = 176,
  placeholder = 'Add notes…',
  className,
  autoFocus,
  onBlur,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  // Mount-only sizing pass; further growth while typing comes from onInput.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(resize, []);

  return (
    <textarea
      ref={ref}
      // Uncontrolled on purpose: `value` is saved via an optimistic mutation
      // (see useOptimisticListMutation), which lands a render tick after the
      // keystroke. A controlled textarea would briefly re-sync to the stale
      // prop in between, and a JS-set `.value` always snaps the caret to the
      // end - invisible when typing at the end, but every mid-string edit
      // would get bounced there. Same fix as the title editor in HubRow.
      defaultValue={value}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      rows={1}
      placeholder={placeholder}
      className={
        className ??
        'w-full bg-transparent resize-none text-sm text-fg-muted placeholder:text-fg-ghost focus:outline-none leading-relaxed overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-fill-stronger'
      }
    />
  );
};

// ── Status / Priority chips - same collection-style tinted pill ───────────────
export interface ChipOption {
  value: string;
  label: string;
  color: string; // base color; chip renders as tinted bg + color-mixed text (like collection pills)
}

// Colors are theme roles (see src/theme). Resolved from --color-* at render, so
// status/priority chips follow the active theme + dark/light mode.
export const STATUS_OPTIONS: ChipOption[] = [
  { value: 'todo',        label: 'Todo',        color: 'var(--color-status-todo)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--color-status-active)' },
  { value: 'completed',   label: 'Completed',   color: 'var(--color-status-done)' },
];

export const PRIORITY_OPTIONS: ChipOption[] = [
  { value: 'low',    label: 'Low',    color: 'var(--color-priority-low)' },
  { value: 'medium', label: 'Medium', color: 'var(--color-priority-med)' },
  { value: 'high',   label: 'High',   color: 'var(--color-priority-high)' },
];

export const statusOption   = (v?: TodoStatus)   => STATUS_OPTIONS.find((o)   => o.value === v);
export const priorityOption = (v?: TodoPriority) => PRIORITY_OPTIONS.find((o) => o.value === v);

export const OptionChip: React.FC<{ option: ChipOption; className?: string }> = ({ option, className = '' }) => (
  <span
    style={pill(option.color)}
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}
  >
    {option.label}
  </span>
);

// Single-select picker over a fixed option set. `variant`:
//   • 'menu'   - vertical list (used in the table's popover, mirroring tags)
//   • 'inline' - wrapped row of chips (used in the full view)
// Clicking the active option again clears the field.
export const OptionSelectField: React.FC<{
  options: ChipOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  variant?: 'menu' | 'inline';
}> = ({ options, value, onChange, variant = 'menu' }) => {
  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          const color = pill(opt.color)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? undefined : opt.value)}
              style={{ ...pill(opt.color)}}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                selected ? `ring-2 ring-[${pill(opt.color).color}]` : 'opacity-50 hover:opacity-100'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(selected ? undefined : opt.value)}
            className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-left transition-colors ${
              selected ? 'bg-fill' : 'hover:bg-fill-subtle'
            }`}
          >
            <OptionChip option={opt} />
            {selected && <Check size={14} className="ml-auto text-fg-subtle" />}
          </button>
        );
      })}
    </div>
  );
};

// ── Collections (single-select picker, breadcrumb chips) ─────────────────────
// A task belongs to one collection (its nearest ancestor) and, transitively, to
// every collection along the path. The chip shows that whole path as tinted
// pills separated by a chevron; the search picks/creates a single collection.


// Renders a collection path as `[root] › [child] › [leaf]`.
// Segments clip at 160px by default. Pass `truncate={false}` where the container
// scrolls horizontally instead of clipping (the collection picker's list).
export const CollectionBreadcrumb: React.FC<{
  path: { id: string; name: string; color?: string }[];
  className?: string;
  truncate?: boolean;
}> = ({ path, className = '', truncate = true }) => (
  <span className={`inline-flex items-center gap-0.5 ${truncate ? 'min-w-0' : ''} ${className}`}>
    {path.map((c, i) => (
      <React.Fragment key={c.id}>
        {i > 0 && <ChevronRight size={12} className="shrink-0 text-fg-ghost" />}
        <span
          style={pill(collectionColor(c.color))}
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            truncate ? 'max-w-[160px] truncate' : 'whitespace-nowrap'
          }`}
        >
          {c.name}
        </span>
      </React.Fragment>
    ))}
  </span>
);

// The picker itself lives in CollectionPicker.tsx - one panel, used everywhere.

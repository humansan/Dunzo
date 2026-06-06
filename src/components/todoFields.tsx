import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Circle, X, Check, ChevronRight, Shapes } from 'lucide-react';
import CheckCircleCutout from '../assets/CheckCircleCutout';
import { timeToPercentage, percentageToTime } from '../utils/timeUtils';
import { TodoStatus, TodoPriority } from '../types';
import { CollectionOption } from '../utils/todoFilters';

// ── Shared todo field editors ────────────────────────────────────────────────
// Small controlled inputs for each todo field, shared by the full-view panel and
// the Task Planner spreadsheet so the editing behaviour stays identical in both.
// The time/percent fields encapsulate the start↔end↔% sync and emit a patch.

// Patch shape emitted by the time/percent fields (a subset of Todo).
export interface TimePatch {
  startTime?: string;
  dueTime?: string;
  duePercentage?: number;
}

// Default look for the boxed inputs (date/time/percent/xp). Callers can override.
export const fieldInputClass =
  'bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors';

// ── Completion toggle ────────────────────────────────────────────────────────
export const CompletedToggle: React.FC<{
  completed: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}> = ({ completed, onToggle, size = 22, className = '' }) => (
  <button onClick={onToggle} className={`shrink-0 cursor-pointer ${className}`}>
    <motion.div
      animate={completed ? { scale: [1.3, 1], rotate: [15, 0] } : {}}
      transition={{ duration: 0.3 }}
      className={`transition-colors duration-200 ${completed ? 'text-[var(--accent1)]' : 'text-white/50 hover:text-white'}`}
    >
      {completed
        ? <CheckCircleCutout size={size} strokeWidth={2.5} />
        : <Circle size={size} strokeWidth={2.5} />}
    </motion.div>
  </button>
);

// ── Date ─────────────────────────────────────────────────────────────────────
export const DateField: React.FC<{
  value: string; // YYYY-MM-DD or ''
  onChange: (val: string) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}> = ({ value, onChange, className, autoFocus, onBlur }) => (
  <input
    type="date"
    value={value}
    autoFocus={autoFocus}
    onBlur={onBlur}
    onChange={(e) => onChange(e.target.value)}
    style={{ colorScheme: 'dark' }}
    className={className ?? fieldInputClass}
  />
);

// ── Start time ───────────────────────────────────────────────────────────────
export const StartTimeField: React.FC<{
  value?: string;
  onChange: (patch: TimePatch) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}> = ({ value, onChange, className, autoFocus, onBlur }) => (
  <input
    type="time"
    value={value || ''}
    autoFocus={autoFocus}
    onBlur={onBlur}
    onChange={(e) => onChange({ startTime: e.target.value || undefined })}
    style={{ colorScheme: 'dark' }}
    className={className ?? fieldInputClass}
  />
);

// ── End time (keeps duePercentage in sync) ──────────────────────────────────
export const EndTimeField: React.FC<{
  value?: string;
  onChange: (patch: TimePatch) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}> = ({ value, onChange, className, autoFocus, onBlur }) => (
  <input
    type="time"
    value={value || ''}
    autoFocus={autoFocus}
    onBlur={onBlur}
    onChange={(e) => {
      const val = e.target.value;
      const p = timeToPercentage(val);
      onChange({ dueTime: val || undefined, ...(p !== undefined ? { duePercentage: p } : {}) });
    }}
    style={{ colorScheme: 'dark' }}
    className={className ?? fieldInputClass}
  />
);

// ── Percent goal (keeps dueTime in sync) ─────────────────────────────────────
export const PercentField: React.FC<{
  value?: number;
  onChange: (patch: TimePatch) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  placeholder?: string;
}> = ({ value, onChange, className, autoFocus, onBlur, placeholder = 'e.g. 50' }) => (
  <input
    type="number"
    min="0"
    max="100"
    step="any"
    value={value ?? ''}
    autoFocus={autoFocus}
    onBlur={onBlur}
    onChange={(e) => {
      const val = e.target.value;
      if (val === '') { onChange({ duePercentage: undefined }); return; }
      const num = parseFloat(val);
      if (!isNaN(num)) {
        const t = percentageToTime(num);
        onChange({ duePercentage: num, ...(t ? { dueTime: t } : {}) });
      }
    }}
    style={{ colorScheme: 'dark' }}
    placeholder={placeholder}
    className={className ?? fieldInputClass}
  />
);

// ── XP ───────────────────────────────────────────────────────────────────────
export const XpField: React.FC<{
  value?: number;
  onChange: (val: number | undefined) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}> = ({ value, onChange, className, autoFocus, onBlur }) => (
  <input
    type="number"
    min="0"
    step="1"
    value={value ?? ''}
    autoFocus={autoFocus}
    onBlur={onBlur}
    onChange={(e) => {
      const v = e.target.value;
      onChange(v === '' ? undefined : Math.max(0, parseInt(v) || 0));
    }}
    style={{ colorScheme: 'dark' }}
    placeholder="0"
    className={className ?? fieldInputClass}
  />
);

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

  useLayoutEffect(resize, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      rows={1}
      placeholder={placeholder}
      className={
        className ??
        'w-full bg-transparent resize-none text-sm text-white/80 placeholder:text-white/25 focus:outline-none leading-relaxed overflow-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/25'
      }
    />
  );
};

// ── Status / Priority chips — same collection-style tinted pill ───────────────
export interface ChipOption {
  value: string;
  label: string;
  color: string; // base color; chip renders as tinted bg + color-mixed text (like collection pills)
}

export const STATUS_OPTIONS: ChipOption[] = [
  { value: 'todo',        label: 'Todo',        color: '#6b7280' }, // gray
  { value: 'in_progress', label: 'In Progress', color: '#3b82f6' }, // blue
  { value: 'completed',   label: 'Completed',   color: '#22c55e' }, // green
];

export const PRIORITY_OPTIONS: ChipOption[] = [
  { value: 'low',    label: 'Low',    color: '#6b7280' }, // slate
  { value: 'medium', label: 'Medium', color: '#f59e0b' }, // amber
  { value: 'high',   label: 'High',   color: '#ef4444' }, // red
];

export const statusOption   = (v?: TodoStatus)   => STATUS_OPTIONS.find((o)   => o.value === v);
export const priorityOption = (v?: TodoPriority) => PRIORITY_OPTIONS.find((o) => o.value === v);

// Tinted-bg pill — matches the collection header pill style for visual consistency.
const chipBg   = (c: string) => `${c}70`;
const chipText = (c: string) => `color-mix(in srgb, ${c} 20%, white)`;

export const OptionChip: React.FC<{ option: ChipOption; className?: string }> = ({ option, className = '' }) => (
  <span
    style={{ backgroundColor: chipBg(option.color), color: chipText(option.color) }}
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}
  >
    {option.label}
  </span>
);

// Single-select picker over a fixed option set. `variant`:
//   • 'menu'   — vertical list (used in the table's popover, mirroring tags)
//   • 'inline' — wrapped row of chips (used in the full view)
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
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? undefined : opt.value)}
              style={{ backgroundColor: chipBg(opt.color), color: chipText(opt.color) }}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                selected
                  ? `ring-2 ring-[${opt.color}] ring-offset`
                  : 'opacity-45 hover:opacity-100'
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
              selected ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <OptionChip option={opt} />
            {selected && <Check size={14} className="ml-auto text-white/60" />}
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

const COLL_FALLBACK = '#9ca3af';
const collChipText = (color?: string) => `color-mix(in srgb, ${color || COLL_FALLBACK} 40%, white)`;
const collChipBg = (color?: string) => `${color || COLL_FALLBACK}40`;

// Renders a collection path as `[root] › [child] › [leaf]`.
export const CollectionBreadcrumb: React.FC<{
  path: { id: string; name: string; color?: string }[];
  className?: string;
}> = ({ path, className = '' }) => (
  <span className={`inline-flex items-center gap-0.5 min-w-0 ${className}`}>
    {path.map((c, i) => (
      <React.Fragment key={c.id}>
        {i > 0 && <ChevronRight size={12} className="shrink-0 text-white/30" />}
        <span
          style={{ backgroundColor: collChipBg(c.color), color: collChipText(c.color) }}
          className="shrink-0 max-w-[160px] truncate rounded-full px-2 py-0.5 text-xs font-medium"
        >
          {c.name}
        </span>
      </React.Fragment>
    ))}
  </span>
);

// Compact collection picker: a search input + a floating dropdown of pilled
// results (create-on-miss). Shared by the quick-edit panel, the Task Planner
// table cell, and the full view.
//   • 'boxed'    (default) — bordered input with the selected pill + clear above it.
//   • 'seamless' — a borderless input that sits inline with the selected pill,
//     blending into a row; clearing is left to the surrounding container.
export const CollectionSearchField: React.FC<{
  value: string | null;
  currentPath: { id: string; name: string; color?: string }[];
  options: CollectionOption[];
  onChange: (id: string | null) => void;
  onCreate: (name: string) => string;
  autoFocus?: boolean;
  placeholder?: string;
  variant?: 'boxed' | 'seamless';
}> = ({ value, currentPath, options, onChange, onCreate, autoFocus, placeholder, variant = 'boxed' }) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const q = input.trim().toLowerCase();
  const matches = options.filter(
    (o) => !q || o.name.toLowerCase().includes(q) || o.path.some((p) => p.name.toLowerCase().includes(q))
  );
  const exact = options.some((o) => o.name.toLowerCase() === q);
  // Only while the input is focused — so the list isn't permanently on screen
  // (it would otherwise cover the rows below it).
  const showPopup = focused && (matches.length > 0 || input.trim().length > 0);
  // Slim by default in the seamless (full-view) layout; the boxed layout tracks
  // the input width. Both grow to fit a long name.
  const dropdownWidthCls =
    variant === 'seamless' ? 'w-max min-w-[180px] max-w-[320px]' : 'min-w-full w-max max-w-[360px]';

  const pick = (id: string) => { onChange(id); setInput(''); };
  const create = () => {
    const name = input.trim();
    if (!name) return;
    onChange(onCreate(name));
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (matches.length > 0) pick(matches[0].id);
      else create();
    }
  };

  const dropdown = showPopup && (
    <div
      data-tag-suggestions
      className={`absolute z-10 top-full left-0 mt-3 ${dropdownWidthCls} max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#222222] shadow-2xl p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full`}
    >
      {matches.map((o) => (
        <button
          key={o.id}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(o.id)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/10 transition-colors"
        >
          <CollectionBreadcrumb path={o.path} className="flex-1" />
          {o.id === value && <Check size={13} className="ml-auto shrink-0 text-white/50" />}
        </button>
      ))}
      {input.trim() && !exact && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={create}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Shapes size={13} className="text-[var(--accent2)] shrink-0" />
          <span className="truncate">Create “{input.trim()}”</span>
        </button>
      )}
    </div>
  );

  if (variant === 'seamless') {
    // Borderless: the selected pill and the input share one row, blending in.
    return (
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5">
          {value && currentPath.length > 0 && <CollectionBreadcrumb path={currentPath} />}
          <input
            autoFocus={autoFocus}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={value ? '' : (placeholder ?? 'Add a collection…')}
            className="flex-1 min-w-[80px] bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none h-7"
          />
        </div>
        {dropdown}
      </div>
    );
  }

  return (
    <div>
      {value && currentPath.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <CollectionBreadcrumb path={currentPath} className="flex-1" />
          <button
            type="button"
            onClick={() => { onChange(null); setInput(''); }}
            className="shrink-0 text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="relative">
        <input
          autoFocus={autoFocus}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder ?? (value ? 'Change collection…' : 'Search or create collection…')}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-white text-sm focus:outline-none focus:border-[var(--accent2)]"
        />
        {dropdown}
      </div>
    </div>
  );
};

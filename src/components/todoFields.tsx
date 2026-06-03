import React, { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Circle, X, Tag as TagIcon } from 'lucide-react';
import CheckCircleCutout from '../assets/CheckCircleCutout';
import { timeToPercentage, percentageToTime } from '../utils/timeUtils';

// ── Shared todo field editors ────────────────────────────────────────────────
// Small controlled inputs for each todo field, shared by the full-view panel and
// the Todos Hub spreadsheet so the editing behaviour stays identical in both.
// The time/percent fields encapsulate the start↔end↔% sync and emit a patch.

// Patch shape emitted by the time/percent fields (a subset of Todo).
export interface TimePatch {
  startTime?: string;
  endTime?: string;
  percentageGoal?: number;
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

// ── End time (keeps percentageGoal in sync) ──────────────────────────────────
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
      onChange({ endTime: val || undefined, ...(p !== undefined ? { percentageGoal: p } : {}) });
    }}
    style={{ colorScheme: 'dark' }}
    className={className ?? fieldInputClass}
  />
);

// ── Percent goal (keeps endTime in sync) ─────────────────────────────────────
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
      if (val === '') { onChange({ percentageGoal: undefined }); return; }
      const num = parseFloat(val);
      if (!isNaN(num)) {
        const t = percentageToTime(num);
        onChange({ percentageGoal: num, ...(t ? { endTime: t } : {}) });
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

// ── Tags (chips + portal autocomplete) ───────────────────────────────────────
const TAG_POPUP_WIDTH = 224; // matches w-56
const TAG_POPUP_MAX_HEIGHT = 208; // matches max-h-52

export const TagsField: React.FC<{
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  inputClassName?: string;
  autoFocus?: boolean;
}> = ({ tags, allTags, onChange, inputClassName, autoFocus }) => {
  const [tagInput, setTagInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [popupPos, setPopupPos] = useState<
    { left: number; width: number; top?: number; bottom?: number } | null
  >(null);

  // Existing tags not yet on this todo, filtered by what's typed.
  const suggestions = (() => {
    const current = new Set(tags);
    const q = tagInput.trim().toLowerCase();
    return allTags
      .filter((t) => !current.has(t))
      .filter((t) => !q || t.toLowerCase().includes(q));
  })();

  const showPopup = focused && (suggestions.length > 0 || tagInput.trim().length > 0);

  const addTagValue = (value: string) => {
    const t = value.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setTagInput('');
  };

  // Enter selects the top suggestion when there is one; a brand-new tag is only
  // created when nothing matches what's typed.
  const addTag = () => {
    if (suggestions.length > 0) addTagValue(suggestions[0]);
    else addTagValue(tagInput);
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  // Position the popup with fixed coords so it isn't clipped by scroll containers.
  useLayoutEffect(() => {
    if (!showPopup) { setPopupPos(null); return; }
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow < TAG_POPUP_MAX_HEIGHT + 16 && r.top > spaceBelow) {
        setPopupPos({ left: r.left, width: TAG_POPUP_WIDTH, bottom: window.innerHeight - r.top + 8 });
      } else {
        setPopupPos({ left: r.left, width: TAG_POPUP_WIDTH, top: r.bottom + 8 });
      }
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [showPopup, tagInput, tags.length]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="group/tag flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[var(--accent2)]/15 text-[var(--accent2)] text-xs font-semibold"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="text-[var(--accent2)]/50 hover:text-[var(--accent2)] transition-colors"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <span className="relative">
        <input
          ref={inputRef}
          type="text"
          value={tagInput}
          autoFocus={autoFocus}
          onChange={(e) => setTagInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
            if (e.key === 'Backspace' && !tagInput && tags.length) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length ? 'Add…' : 'Add a tag…'}
          className={
            inputClassName ??
            'w-40 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none h-7'
          }
        />

        {showPopup && popupPos && createPortal(
          <div
            style={{
              position: 'fixed',
              left: popupPos.left,
              top: popupPos.top,
              bottom: popupPos.bottom,
              width: popupPos.width,
            }}
            className="z-[60] max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-[#222222] shadow-2xl p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {suggestions.length > 0 ? (
              suggestions.map((tag) => (
                <button
                  key={tag}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTagValue(tag)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <TagIcon size={12} className="text-[var(--accent2)] shrink-0" />
                  <span className="truncate">{tag}</span>
                </button>
              ))
            ) : (
              <div className="px-2.5 py-2 text-xs text-white/40 leading-relaxed">
                Press <span className="text-white/70 font-semibold">Enter</span> to add new tag
              </div>
            )}
          </div>,
          document.body
        )}
      </span>
    </div>
  );
};

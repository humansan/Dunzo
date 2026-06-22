import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// ── General single-select dropdown ───────────────────────────────────────────
// A themed drop-in replacement for the browser's <select>: a trigger styled like
// the toolbar inputs plus a body-portaled option list (so it escapes any
// overflow-clipping/scroll container — toolbar popovers, modals, table cells).
// Unlike OptionSelectField (status/priority), options are plain text rows, not
// tinted pills, so it works for arbitrary option sets.

export interface ListSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const ListSelect: React.FC<{
  options: ListSelectOption[];
  value: string;
  onChange: (value: string) => void;
  // Width/spacing utilities for the trigger (e.g. 'w-full', 'w-[110px]').
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}> = ({ options, value, onChange, className = '', placeholder = 'Select…', ariaLabel, disabled }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  // Anchor the floating list under the trigger; re-measure on scroll/resize so it
  // tracks the trigger while open (it lives in a body portal, not the flow).
  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape regardless of focus location.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const pick = (opt: ListSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex items-center gap-2 bg-[#2a2a2a] border rounded-lg px-2.5 h-8 text-[13px] transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-[var(--accent2)]' : 'border-white/10 hover:border-white/20'
        } ${className}`}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${selected ? 'text-white/90' : 'text-white/35'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {/* Click-catching backdrop; closes only this dropdown (sits above any
                parent popover backdrop, so the surrounding menu stays open). */}
            <div
              className="fixed inset-0 z-[80]"
              onMouseDown={() => setOpen(false)}
              onContextMenu={(e) => { e.preventDefault(); setOpen(false); }}
            />
            <div
              ref={menuRef}
              role="listbox"
              style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth: pos.width }}
              className="z-[81] flex flex-col gap-0.5 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0 text-white/60" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </>
  );
};

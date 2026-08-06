import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// ── General single-select dropdown ───────────────────────────────────────────
// A themed drop-in replacement for the browser's <select>: a trigger styled like
// the toolbar inputs plus a body-portaled option list (so it escapes any
// overflow-clipping/scroll container - toolbar popovers, modals, table cells).
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

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : undefined;
  const [active, setActive] = useState(Math.max(0, selectedIdx));
  const clamped = Math.min(active, Math.max(0, options.length - 1));

  // Reset active index to current selection when dropdown opens.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActive(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  // Keep highlighted option in view inside menu popover.
  useEffect(() => {
    if (!open) return;
    const box = menuRef.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [open, clamped, options.length]);

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

  const pick = (opt: ListSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Keyboard navigation when open (ArrowUp/Down, Enter, Escape).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (!options.length) return;
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (Math.min(i, options.length - 1) + d + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (options[clamped] && !options[clamped].disabled) {
          pick(options[clamped]);
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, clamped, options]);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
    }
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
        onKeyDown={onTriggerKeyDown}
        className={`flex items-center gap-2 bg-overlay border rounded-lg px-2.5 h-8 text-[13px] transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-[var(--accent2)]' : 'border-line hover:border-line-strong'
        } ${className}`}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${selected ? 'text-fg' : 'text-fg-faint'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`}
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
              className="z-[81] flex flex-col gap-0.5 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl p-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {options.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === clamped;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    disabled={opt.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                      isActive ? 'bg-fill text-fg' : 'text-fg-muted hover:bg-fill-subtle hover:text-fg'
                    }`}
                  >
                    <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0 text-fg-subtle" />}
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

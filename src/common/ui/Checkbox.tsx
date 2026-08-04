import React from 'react';
import { Check } from 'lucide-react';

// Shared square checkbox: an accent2-filled box with a check when on. Extracted from
// AuthModal's "Remember me" control so the same box is reused (auth + calendar surface
// toggles). Pass the label as children so each caller owns its typography.
export const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  children?: React.ReactNode;
  'aria-label'?: string;
  gold?: boolean;
}> = ({ checked, onChange, className, children, 'aria-label': ariaLabel, gold }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 cursor-pointer group ${className ?? ''}`}
  >
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked
          ? gold
            ? 'bg-xp-tier1 border-xp-tier1 text-canvas'
            : 'bg-accent2 border-accent2 text-canvas'
          : 'border-line group-hover:border-line-strong'
      }`}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </span>
    {children}
  </button>
);

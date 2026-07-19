import React from 'react';

// Shared on/off switch (role="switch"). Replaces the four near-identical inline toggles
// that used to live in AccountModal, SectionsMenu, TodoFullView and CalendarInput - one
// component now, so the style stays in sync. Track fills with accent2 when on; the knob
// slides. Pass `disabled` for a non-interactive (dimmed) state.
interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Accessible name when there's no adjacent visible label. */
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
      checked ? 'bg-[var(--accent2)]' : 'bg-fill-strong'
    } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

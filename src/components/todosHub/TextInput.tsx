import React from 'react';

// ── Themed text input ─────────────────────────────────────────────────────────
// A drop-in <input> styled to match the ListSelect trigger: a #2a2a2a fill whose
// border lightens on hover and turns accent on focus, with a color transition.
// Default height is 32px total (h-8, border-box incl. the 1px border) so it lines
// up with the dropdown trigger. Compact contexts (the date/time pickers) reuse
// `inputBaseCls` but set their own height.

// Border/fill/interaction styling, without sizing — so callers can pick a height.
export const inputBaseCls =
  'bg-[#2a2a2a] border border-white/10 rounded-lg text-white placeholder:text-white/35 transition-colors focus:outline-none hover:border-white/20 focus:border-[var(--accent2)]';

// The full default look (matches the ListSelect trigger box).
export const textInputCls = `${inputBaseCls} px-2.5 h-8 text-[13px]`;

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${textInputCls} ${className}`} {...props} />
  )
);
TextInput.displayName = 'TextInput';

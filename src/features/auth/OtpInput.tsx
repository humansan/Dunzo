import React, { useRef, useEffect } from 'react';

// Six-box one-time-code field. Typing advances, Backspace retreats, and a paste
// anywhere in the row fills the whole code (the digits are also readable as one
// string by password managers via `autoComplete="one-time-code"` on box 1).
//
// The value is owned by the parent as a plain string of up to `length` digits;
// this component only ever hands back digits.

const LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last digit lands, so the caller can submit without a click. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
}) => {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  // Also re-runs when the row leaves the disabled state - i.e. once the code
  // finishes sending, and after a rejected code clears the boxes - so the caret
  // is always waiting in box 1 without a click.
  useEffect(() => {
    if (autoFocus && !disabled) inputs.current[0]?.focus();
  }, [autoFocus, disabled]);

  const digits = value.padEnd(LENGTH).slice(0, LENGTH).split('');

  const focusBox = (i: number) => {
    const el = inputs.current[Math.max(0, Math.min(LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  // Write `next` and, when it completes the code, hand it up. Focus lands on the
  // box after the last one written.
  const commit = (next: string, caret: number) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    focusBox(caret);
    if (clean.length === LENGTH) onComplete?.(clean);
  };

  const handleChange = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // Typing into a box overwrites it; multi-char input (autofill, fast typing,
    // or a paste that lands as input) spills forward from this box.
    const chars = value.padEnd(LENGTH).split('');
    for (let k = 0; k < typed.length && i + k < LENGTH; k++) chars[i + k] = typed[k];
    commit(chars.join('').trimEnd(), i + typed.length);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = value.padEnd(LENGTH).split('');
      // Backspace clears this box, or - when it's already empty - the one before it.
      const target = chars[i].trim() ? i : i - 1;
      if (target < 0) return;
      chars[target] = ' ';
      commit(chars.join('').trimEnd(), target);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // Pasting the code from the email works from any box - it always fills from
    // the start, which is what people expect when they paste all six digits.
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    commit(pasted, pasted.length);
  };

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          disabled={disabled}
          value={digits[i].trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className={`w-full min-w-0 h-12 rounded-lg bg-fill-subtle ring text-center text-lg font-semibold text-fg
            focus:outline-none focus:ring-2 transition-all disabled:opacity-50
            ${invalid ? 'ring-red-500/60 focus:ring-red-500' : 'ring-line focus:ring-(--accent1)'}`}
        />
      ))}
    </div>
  );
};

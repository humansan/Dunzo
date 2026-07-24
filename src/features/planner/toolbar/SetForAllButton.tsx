import React, { useEffect, useRef, useState } from 'react';
import { Check, CopyCheck } from 'lucide-react';
import { btnAccent, btnNeutral } from '@/theme/buttons';

const ARM_TIMEOUT_MS = 4000;   // disarm if the second click never comes
const APPLIED_TIMEOUT_MS = 1500;

// The "Set for all" control in a toolbar menu's header (see PopoverMenu's
// headerAction). Broadcasting is not undoable - it clears that menu's settings
// from every other view in the workspace - so this arms on the first click and
// only commits on the second. The app has no toast or confirm-dialog infra, and
// a modal would be disproportionate inside a popover, so the whole confirm lives
// on the button itself and unmounts with the menu.
//
// Styling mirrors the CollectionTree header button (label then icon). The
// `normal-case tracking-normal` is required: the popover header sets `uppercase
// tracking-wider`, which would otherwise be inherited and render "SET FOR ALL".
export const SetForAllButton: React.FC<{
  onConfirm: () => void;
  // What gets broadcast, for the tooltip - e.g. "filters", "field order and visibility".
  what: string;
}> = ({ onConfirm, what }) => {
  const [phase, setPhase] = useState<'idle' | 'armed' | 'applied'>('idle');
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clear, []);

  const after = (ms: number, next: 'idle') => {
    clear();
    timer.current = window.setTimeout(() => setPhase(next), ms);
  };

  const onClick = () => {
    if (phase === 'armed') {
      onConfirm();
      setPhase('applied');
      after(APPLIED_TIMEOUT_MS, 'idle');
      return;
    }
    if (phase === 'idle') {
      setPhase('armed');
      after(ARM_TIMEOUT_MS, 'idle');
    }
  };

  const label = phase === 'armed' ? 'Apply to all?' : phase === 'applied' ? 'Applied' : 'Set for all';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Use these ${what} on every planner view in this workspace, and as the default for new views. Clears per-view ${what} elsewhere.`}
      className={`shrink-0 flex items-center gap-1 rounded pl-2 pr-1.25 py-0.75 text-[11px] font-semibold normal-case tracking-normal ${
        phase === 'armed' ? btnAccent('accent2') : btnNeutral
      }`}
    >
      {label}
      {phase === 'applied' ? <Check size={12} /> : <CopyCheck size={12} />}
    </button>
  );
};

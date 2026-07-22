import React from 'react';
import { useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { PHASE_LABEL, type Phase } from '@/features/stopwatch/types';
import type { FocusSize } from '@/features/stopwatch/ui/focusUi';

const PHASES: Phase[] = ['focus', 'shortBreak', 'longBreak'];

// Which block you're in, and a way to jump to another one. Doubling as the label
// is the point: a separate readout plus a separate control would say the same
// thing twice.
//
// Unlike the mode switcher, this stays live while the clock runs - jumping to a
// break mid-block is a normal thing to want, and it lands idle rather than
// starting behind your back.
export const PhaseSelector: React.FC<{ size?: FocusSize }> = ({ size = 'sm' }) => {
  const { mode, phase, selectPhase } = useStopwatch();
  if (mode !== 'pomodoro') return null;

  return (
    <div className={`flex items-center gap-5`} role="tablist" aria-label="Pomodoro block">
      {PHASES.map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={phase === p}
          onClick={() => selectPhase(p)}
          className={`font-medium transition-colors cursor-pointer ${
            phase === p ? 'text-white' : 'text-white/35 hover:text-white/70'
          }`}
        >
          {PHASE_LABEL[p]}
        </button>
      ))}
    </div>
  );
};

// One dot per focus block in the set, filled as they complete. The whole point is
// telling you where you are without doing arithmetic on a cycle counter.
export const CycleDots: React.FC<{ size?: FocusSize }> = ({ size = 'sm' }) => {
  const { mode, cycleIndex, prefs } = useStopwatch();
  if (mode !== 'pomodoro') return null;
  const dot = size === 'lg' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';

  return (
    <div className="flex items-center gap-1.5" title={`${cycleIndex} of ${prefs.setSize} in this set`}>
      {Array.from({ length: prefs.setSize }, (_, i) => (
        <span
          key={i}
          className={`${dot} rounded-full transition-colors ${i < cycleIndex ? 'bg-white' : 'bg-white/25'}`}
        />
      ))}
    </div>
  );
};

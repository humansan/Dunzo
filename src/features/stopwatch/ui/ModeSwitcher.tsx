import React from 'react';
import { useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { focusSegment, type FocusSize } from '@/features/stopwatch/ui/focusUi';
import type { FocusMode } from '@/features/stopwatch/types';

const MODES: { id: FocusMode; label: string; short: string }[] = [
  { id: 'stopwatch', label: 'Stopwatch', short: 'Watch' },
  { id: 'timer', label: 'Timer', short: 'Timer' },
  { id: 'pomodoro', label: 'Pomodoro', short: 'Pomo' },
];

// Switching is blocked while a session is live - rebasing the clock mid-block
// would silently discard what you're in the middle of. Disabling the control says
// so up front instead of letting the click do nothing.
export const ModeSwitcher: React.FC<{ size?: FocusSize }> = ({ size = 'sm' }) => {
  const { mode, setMode, timerState } = useStopwatch();
  const locked = timerState !== 'idle';

  return (
    <div
      className={`flex items-center rounded-full bg-black/25 backdrop-blur-sm gap-1 p-1`}
      role="tablist"
      aria-label="Focus mode"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          disabled={locked && mode !== m.id}
          onClick={() => setMode(m.id)}
          className={`${focusSegment(mode === m.id, size)} ${locked && mode !== m.id ? 'opacity-40' : ''}`}
          title={locked && mode !== m.id ? 'Reset the current session to switch modes' : undefined}
        >
          {size === 'lg' ? m.label : m.short}
        </button>
      ))}
    </div>
  );
};

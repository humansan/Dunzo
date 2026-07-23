import React from 'react';
import { Play, Pause, RotateCcw, SkipForward, Plus } from 'lucide-react';
import { useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { focusIcon, focusIconWide, focusPrimary, type FocusSize } from '@/features/stopwatch/ui/focusUi';

const EXTEND_MS = 5 * 60_000;

// The one control cluster, for both the widget and the fullscreen view.
//
// These buttons used to be hand-rolled three times per view (idle / running /
// paused) in each of two files - six near-identical blocks that had already
// drifted. Adding "+5" and "Skip" to that would have made twelve.
//
// Reads the engine directly rather than taking callbacks: both hosts already
// consume the context for their background, so props were only ever a relay.
// `compact` drops the mode-specific extras (+5, Skip) down to just play/pause and
// reset - the minimized card is meant to be glanceable while you work, so anything
// you'd only reach for occasionally belongs in the fullscreen view instead.
export const FocusControls: React.FC<{ size?: FocusSize; compact?: boolean }> = ({
  size = 'sm',
  compact = false,
}) => {
  const {
    mode, timerState, targetMs,
    startTimer, pauseTimer, resetTimer, skipPhase, extendTimer,
  } = useStopwatch();

  const iconSize = size === 'lg' ? 20 : 16;
  const isCountdown = targetMs > 0;
  const isLive = timerState === 'running' || timerState === 'paused';

  return (
    <div className={`flex items-center justify-center ${size === 'lg' ? 'gap-4' : 'gap-3'}`}>
      {timerState === 'running' ? (
        <button onClick={pauseTimer} className={focusPrimary(size)}>
          <Pause size={iconSize} fill="currentColor" />
          <span>Pause</span>
        </button>
      ) : (
        <button onClick={startTimer} className={focusPrimary(size)}>
          <Play size={iconSize} fill="currentColor" />
          <span>{timerState === 'paused' ? 'Resume' : 'Start'}</span>
        </button>
      )}

      {/* Reset is always available: in pomodoro it restarts the current block, and
          pressing it again on an already-full block clears the set. */}
      <button
        onClick={resetTimer}
        className={focusIcon(size)}
        title={mode === 'pomodoro' ? 'Reset block (again to clear the set)' : 'Reset'}
      >
        <RotateCcw size={iconSize} />
      </button>

      {/* Only meaningful once a countdown is actually under way. */}
      {!compact && isCountdown && mode !== 'pomodoro' && isLive && (
        <button
          onClick={() => extendTimer(EXTEND_MS)}
          className={focusIconWide(size)}
          title="Add 5 minutes"
        >
          <Plus size={iconSize - 4} />
          <span>5</span>
        </button>
      )}

      {!compact && mode === 'pomodoro' && (
        <button onClick={skipPhase} className={focusIcon(size)} title="Skip to next block">
          <SkipForward size={iconSize} />
        </button>
      )}
    </div>
  );
};

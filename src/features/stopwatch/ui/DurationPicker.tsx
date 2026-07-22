import React, { useState } from 'react';
import { useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { parseDuration } from '@/features/stopwatch/parseDuration';
import { focusSegment, type FocusSize } from '@/features/stopwatch/ui/focusUi';
import { MIN } from '@/features/stopwatch/types';

const PRESETS = [5, 10, 15, 30, 60];

// Shown in timer mode while idle. Hidden once running, where changing the target
// out from under a live countdown would be a surprise (use "+5" instead).
export const DurationPicker: React.FC<{ size?: FocusSize }> = ({ size = 'sm' }) => {
  const { targetMs, setTimerDuration } = useStopwatch();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (!draft.trim()) return;
    const ms = parseDuration(draft);
    if (ms === null) {
      setInvalid(true);
      return;
    }
    setTimerDuration(ms);
    setDraft('');
    setInvalid(false);
  };

  return (
    <div className={`flex items-center justify-center flex-wrap gap-2 h-8`}>
      {PRESETS.map((m) => (
        <button
          key={m}
          onClick={() => setTimerDuration(m * MIN)}
          className={focusSegment(targetMs === m * MIN, size)}
        >
          {m}m
        </button>
      ))}
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(''); setInvalid(false); }
          // The global shortcuts must not fire while someone is typing "25".
          e.stopPropagation();
        }}
        placeholder="custom"
        aria-label="Custom duration"
        className={`rounded-full bg-white/10 text-white placeholder:text-white/40 outline-none border transition-colors
          ${invalid ? 'border-red-400/70' : 'border-white/10 focus:border-white/40'}
          ${size === 'lg' ? 'w-24 px-3 py-1.5 text-sm' : 'w-20 px-2.5 py-1 text-xs'}`}
      />
    </div>
  );
};

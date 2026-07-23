import React, { useState } from 'react';
import { useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { notificationPermission, requestNotifications } from '@/features/stopwatch/notify';
import { MIN } from '@/features/stopwatch/types';
import { focusPanel } from '@/features/stopwatch/ui/focusUi';

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-6 py-1.5">
    <div className="min-w-0">
      <p className="text-sm text-white/90">{label}</p>
      {hint && <p className="text-[11px] text-white/45 leading-tight">{hint}</p>}
    </div>
    {children}
  </div>
);

const Stepper: React.FC<{ value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }> = ({
  value, min, max, unit, onChange,
}) => (
  <div className="flex items-center gap-1 shrink-0">
    <button
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer leading-none"
    >
      −
    </button>
    <span className="w-14 text-center text-sm tabular-nums">{value}{unit}</span>
    <button
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer leading-none"
    >
      +
    </button>
  </div>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, onChange, disabled }) => (
  <button
    role="switch"
    aria-checked={on}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`w-10 h-6 rounded-full shrink-0 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-white/80' : 'bg-white/20'}`}
  >
    <span
      className={`block w-4 h-4 rounded-full bg-black/70 transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`}
    />
  </button>
);

// Fullscreen-only, mirroring the background-settings popover next to it. The widget
// deliberately has no config: it's a 360px card, and anything this dense in it
// would crowd out the clock it exists to show.
export const FocusConfigPanel: React.FC = () => {
  const { prefs, setPrefs } = useStopwatch();
  const [permission, setPermission] = useState(notificationPermission);

  // Browsers only accept a permission prompt from a user gesture, which is this
  // click. Turning the pref on without permission would be a switch that lies.
  const toggleNotify = async (want: boolean) => {
    if (!want) {
      setPrefs({ notify: false });
      return;
    }
    const granted = await requestNotifications();
    setPermission(notificationPermission());
    setPrefs({ notify: granted });
  };

  const mins = (ms: number) => Math.round(ms / MIN);

  return (
    <div className={`${focusPanel} w-80 p-5`}>
      <p className="text-white text-sm font-semibold mb-2">Pomodoro</p>
      <Row label="Focus">
        <Stepper value={mins(prefs.focusMs)} min={1} max={120} unit="m" onChange={(v) => setPrefs({ focusMs: v * MIN })} />
      </Row>
      <Row label="Short break">
        <Stepper value={mins(prefs.shortMs)} min={1} max={60} unit="m" onChange={(v) => setPrefs({ shortMs: v * MIN })} />
      </Row>
      <Row label="Long break">
        <Stepper value={mins(prefs.longMs)} min={1} max={60} unit="m" onChange={(v) => setPrefs({ longMs: v * MIN })} />
      </Row>
      <Row label="Long break every">
        <Stepper value={prefs.setSize} min={2} max={12} onChange={(v) => setPrefs({ setSize: v })} />
      </Row>

      <div className="h-px bg-white/10 my-3" />

      <Row label="Auto-start breaks">
        <Toggle on={prefs.autoStartBreak} onChange={(v) => setPrefs({ autoStartBreak: v })} />
      </Row>
      <Row label="Auto-start next focus" hint="Off means each block requires manual start">
        <Toggle on={prefs.autoStartFocus} onChange={(v) => setPrefs({ autoStartFocus: v })} />
      </Row>

      <div className="h-px bg-white/10 my-3" />

      <Row
        label="Notify me"
        hint={
          permission === 'unsupported' ? 'Not supported in this browser.'
          : permission === 'denied' ? 'Blocked - re-enable in browser site settings.'
          : 'Only when the app is in the background'
        }
      >
        <Toggle
          on={prefs.notify}
          disabled={permission === 'denied' || permission === 'unsupported'}
          onChange={toggleNotify}
        />
      </Row>
    </div>
  );
};

// Shared vocabulary for the focus feature (stopwatch / timer / pomodoro).
//
// These used to live in StopwatchWidget.tsx, which meant the context and the
// fullscreen view both imported a type from a sibling *component* - a dependency
// that only existed because there was nowhere else to put it.

export type TimerState = 'idle' | 'running' | 'paused';

export type FocusMode = 'stopwatch' | 'timer' | 'pomodoro';

export type Phase = 'focus' | 'shortBreak' | 'longBreak';

// User-tunable durations and behavior. Persisted as one blob under `dun-sw-prefs`.
export interface FocusPrefs {
  timerMs: number;   // last-used countdown duration, restored when timer mode opens
  focusMs: number;
  shortMs: number;
  longMs: number;
  setSize: number;   // focus blocks per long break
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  notify: boolean;
}

export const MIN = 60_000;

export const DEFAULT_PREFS: FocusPrefs = {
  timerMs: 25 * MIN,
  focusMs: 25 * MIN,
  shortMs: 5 * MIN,
  longMs: 15 * MIN,
  setSize: 4,
  autoStartBreak: true,
  // Off by default: auto-starting the *next focus block* would trap you in a loop
  // you never chose to re-enter. Breaks auto-start; work does not.
  autoStartFocus: false,
  notify: false,
};

export const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

// A countdown's length for the current phase. Stopwatch has no target (0).
export function phaseDuration(phase: Phase, p: FocusPrefs): number {
  return phase === 'focus' ? p.focusMs : phase === 'shortBreak' ? p.shortMs : p.longMs;
}

// mm:ss, or hh:mm:ss past an hour. Takes the absolute value so overtime can be
// rendered as a `+` prefix plus a normally-formatted duration.
export function formatTime(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

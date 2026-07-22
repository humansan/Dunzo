// localStorage for the focus feature: preferences and the in-flight session.
//
// The background *image* is far too big for localStorage and lives in IndexedDB
// (see bgStore.ts). Everything here is a handful of numbers and flags, which is
// exactly what localStorage is for. Key names follow the existing `dun-sw-*`
// convention used by the background settings.

import { DEFAULT_PREFS, type FocusMode, type FocusPrefs, type Phase, type TimerState } from './types';

const PREFS_KEY = 'dun-sw-prefs';
const SESSION_KEY = 'dun-sw-session';

// The running clock, written on every state *transition* - never on a tick.
// `startTime` and `pausedElapsed` mirror the two refs in the context, so a reload
// can rebuild elapsed time from the wall clock exactly as the live engine does.
export interface StoredSession {
  mode: FocusMode;
  phase: Phase;
  timerState: TimerState;
  startTime: number;
  pausedElapsed: number;
  targetMs: number;
  cycleIndex: number;
}

// Every read is defensive: storage can be unavailable (private mode, blocked
// cookies) or hold something an older build wrote. A bad read must degrade to
// defaults, never throw during provider construction.
function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or blocked storage - the session stays correct in memory, it just
    // won't survive a reload. Not worth interrupting the user over.
  }
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function loadPrefs(): FocusPrefs {
  const s = read<FocusPrefs>(PREFS_KEY);
  if (!s) return DEFAULT_PREFS;
  return {
    timerMs: num(s.timerMs, DEFAULT_PREFS.timerMs),
    focusMs: num(s.focusMs, DEFAULT_PREFS.focusMs),
    shortMs: num(s.shortMs, DEFAULT_PREFS.shortMs),
    longMs: num(s.longMs, DEFAULT_PREFS.longMs),
    setSize: Math.max(1, Math.round(num(s.setSize, DEFAULT_PREFS.setSize))),
    autoStartBreak: bool(s.autoStartBreak, DEFAULT_PREFS.autoStartBreak),
    autoStartFocus: bool(s.autoStartFocus, DEFAULT_PREFS.autoStartFocus),
    notify: bool(s.notify, DEFAULT_PREFS.notify),
  };
}

export function savePrefs(p: FocusPrefs): void {
  write(PREFS_KEY, p);
}

const MODES: FocusMode[] = ['stopwatch', 'timer', 'pomodoro'];
const PHASES: Phase[] = ['focus', 'shortBreak', 'longBreak'];
const STATES: TimerState[] = ['idle', 'running', 'paused'];

export function loadSession(): StoredSession | null {
  const s = read<StoredSession>(SESSION_KEY);
  if (!s) return null;
  // A session whose enum fields don't validate is discarded rather than coerced -
  // a half-restored clock is worse than starting fresh.
  if (!MODES.includes(s.mode as FocusMode)) return null;
  if (!PHASES.includes(s.phase as Phase)) return null;
  if (!STATES.includes(s.timerState as TimerState)) return null;
  return {
    mode: s.mode as FocusMode,
    phase: s.phase as Phase,
    timerState: s.timerState as TimerState,
    startTime: num(s.startTime, 0),
    pausedElapsed: num(s.pausedElapsed, 0),
    targetMs: num(s.targetMs, 0),
    cycleIndex: Math.max(0, Math.round(num(s.cycleIndex, 0))),
  };
}

export function saveSession(s: StoredSession): void {
  write(SESSION_KEY, s);
}

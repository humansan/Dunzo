import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadBgImage, migrateLegacyBg, saveBgImage } from '@/features/stopwatch/bgStore';
import { loadPrefs, loadSession, savePrefs, saveSession } from '@/features/stopwatch/focusStore';
import { notifyPhaseEnd } from '@/features/stopwatch/notify';
import {
  formatTime,
  phaseDuration,
  type FocusMode,
  type FocusPrefs,
  type Phase,
  type TimerState,
} from '@/features/stopwatch/types';
import defaultBgUrl from '@/assets/stopwatch_default.jpg';

// The background (image + dimness + blur) is shared by the widget and the fullscreen
// view. It lives here rather than in each component because they used to keep private
// copies read from storage on mount, which only stayed in sync thanks to the
// unmount/remount dance between the two modes.
function useProvideBackground() {
  // null ⇒ no custom image, so the bundled default is used.
  const [bgBlob, setBgBlob] = useState<Blob | null>(null);
  const [bgUrl, setBgUrl] = useState<string>(defaultBgUrl);
  const [bgDimness, setBgDimnessState] = useState<number>(0.3);
  const [bgBlur, setBgBlurState] = useState<number>(0);
  // Set when a save fails, so the UI can say so instead of silently reverting later.
  const [bgError, setBgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyBg();
        const blob = await loadBgImage();
        if (!cancelled && blob) setBgBlob(blob);
      } catch {
        // Storage unavailable (private mode, blocked) - keep the default image.
      }
    })();
    // Dimness and blur are two short strings; localStorage is the right size for them.
    const d = localStorage.getItem('dun-sw-bg-dimness');
    if (d) setBgDimnessState(parseFloat(d));
    const b = localStorage.getItem('dun-sw-bg-blur');
    if (b) setBgBlurState(parseFloat(b));
    return () => { cancelled = true; };
  }, []);

  // The blob is exposed to <img> as an object URL, revoked when it's replaced.
  useEffect(() => {
    if (!bgBlob) {
      setBgUrl(defaultBgUrl);
      return;
    }
    const url = URL.createObjectURL(bgBlob);
    setBgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bgBlob]);

  // A File is already a Blob, so the picked file is stored as-is - no base64 hop.
  const setBgImage = useCallback(async (file: File) => {
    setBgBlob(file);
    try {
      await saveBgImage(file);
      setBgError(null);
    } catch {
      setBgError("Couldn't save this background - it will reset when you reload.");
    }
  }, []);

  const setBgDimness = useCallback((v: number) => {
    setBgDimnessState(v);
    localStorage.setItem('dun-sw-bg-dimness', v.toString());
  }, []);

  const setBgBlur = useCallback((v: number) => {
    setBgBlurState(v);
    localStorage.setItem('dun-sw-bg-blur', v.toString());
  }, []);

  return { bgUrl, bgDimness, bgBlur, bgError, setBgImage, setBgDimness, setBgBlur };
}

// The focus engine, shared by all three modes. Crucially, `elapsed` is NOT stored
// here - it's derived on demand by `useElapsed()` in a leaf, so the tick re-renders
// only the digits, not every consumer.
//
// All three modes run on the same two refs. The only difference is `targetMs`:
// 0 means count up (stopwatch), > 0 means count down and fire a phase end. That's
// why overtime needs no state of its own - it's just `elapsed > targetMs`.
function useProvideFocus() {
  // One-shot reads, via lazy initializers so storage is touched once per mount.
  const [restored] = useState(loadSession);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [baseTitle] = useState(() => (typeof document === 'undefined' ? '' : document.title));

  const [mode, setModeState] = useState<FocusMode>(restored?.mode ?? 'stopwatch');
  const [phase, setPhase] = useState<Phase>(restored?.phase ?? 'focus');
  const [cycleIndex, setCycleIndex] = useState<number>(restored?.cycleIndex ?? 0);
  const [targetMs, setTargetMs] = useState<number>(restored?.targetMs ?? 0);
  const [timerState, setTimerState] = useState<TimerState>(restored?.timerState ?? 'idle');

  // Bumped on every phase end so the views can flash. With no audio in v0 this is
  // the primary end-of-phase signal, so it fires whether or not you're looking.
  const [pulseKey, setPulseKey] = useState(0);

  const [isStopwatchVisible, setIsStopwatchVisible] = useState(false);
  const [isStopwatchFullscreen, setIsStopwatchFullscreen] = useState(false);

  // Did the session we just loaded already run out while the tab was closed?
  const [restoredExpired] = useState(
    () =>
      !!restored &&
      restored.timerState === 'running' &&
      restored.targetMs > 0 &&
      restored.pausedElapsed + (Date.now() - restored.startTime) >= restored.targetMs,
  );

  const startTimeRef = useRef<number>(restored?.startTime ?? 0);
  const pausedElapsedRef = useRef<number>(restored?.pausedElapsed ?? 0);
  // Whether the current target has already been announced, so a 250ms poll fires
  // the phase end exactly once. Cleared by everything that gives the clock a new
  // target to run at (new phase, reset, mode change, "+5").
  //
  // This is a flag rather than "the deadline we already fired", which looks
  // equivalent but isn't: pausing during overtime and resuming rebases the
  // deadline, so a deadline-keyed guard would re-announce a finished timer.
  //
  // Seeded here rather than in the restore effect below because the heartbeat's
  // first tick runs synchronously when *its* effect mounts, which is before the
  // restore effect gets a turn - a false start would announce a phase that ended
  // an hour ago.
  const expiredRef = useRef(restoredExpired);

  const background = useProvideBackground();

  // ── Preferences ────────────────────────────────────────────────────────────

  const setPrefs = useCallback((patch: Partial<FocusPrefs>) => {
    setPrefsState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  // Retuning the pomodoro while it sits idle should move the clock you're looking
  // at. Mid-block it must not - yanking the countdown out from under a running
  // session is exactly the surprise this guard exists to prevent.
  useEffect(() => {
    if (mode !== 'pomodoro' || timerState !== 'idle') return;
    setTargetMs(phaseDuration(phase, prefs));
  }, [mode, timerState, phase, prefs]);

  // ── Phase transitions ──────────────────────────────────────────────────────

  const goToPhase = useCallback((next: Phase, autoStart: boolean, p: FocusPrefs) => {
    setPhase(next);
    setTargetMs(phaseDuration(next, p));
    pausedElapsedRef.current = 0;
    startTimeRef.current = Date.now();
    expiredRef.current = false;
    setTimerState(autoStart ? 'running' : 'idle');
  }, []);

  // The single path a countdown leaves a phase by: natural expiry, an explicit
  // skip, or a restore that found the deadline already passed.
  //
  //   announce  fire the notification + on-screen pulse (off for skip/restore -
  //             you already know, or it happened while you were away).
  //   autoStart honor the auto-start prefs (off for restore: never start a block
  //             you weren't there to begin).
  const advance = useCallback(
    (o: { announce: boolean; autoStart: boolean }) => {
      if (o.announce) setPulseKey((k) => k + 1);

      // A plain timer has nowhere to advance to - it rolls into overtime and keeps
      // counting, so a session that ran long still tells you by how much.
      if (mode !== 'pomodoro') {
        if (o.announce) {
          notifyPhaseEnd(prefs.notify, 'Timer done', 'Your countdown finished.');
        }
        return;
      }

      if (phase === 'focus') {
        const done = cycleIndex + 1;
        const isLong = done >= prefs.setSize;
        setCycleIndex(done);
        if (o.announce) {
          notifyPhaseEnd(
            prefs.notify,
            'Focus block done',
            isLong ? 'Time for a long break.' : 'Time for a short break.',
          );
        }
        goToPhase(isLong ? 'longBreak' : 'shortBreak', o.autoStart && prefs.autoStartBreak, prefs);
      } else {
        // A long break closes the set, so the next focus block starts a fresh one.
        if (phase === 'longBreak') setCycleIndex(0);
        if (o.announce) notifyPhaseEnd(prefs.notify, 'Break over', 'Back to focus.');
        goToPhase('focus', o.autoStart && prefs.autoStartFocus, prefs);
      }
    },
    [mode, phase, cycleIndex, prefs, goToPhase],
  );

  // ── Heartbeat: phase expiry + title countdown ──────────────────────────────
  //
  // `useElapsed()` only ticks inside whichever component renders it, so it can't be
  // trusted to fire the phase end - the widget may be closed. This is the one timer
  // the provider owns, and it runs only while something is actually running.
  //
  // Deliberately an interval that compares against the wall clock, NOT
  // `setTimeout(remaining)`: background tabs throttle and drift long timeouts, and
  // a 25-minute pomodoro in a background tab is precisely the case that matters.
  useEffect(() => {
    if (timerState !== 'running') return;

    const tick = () => {
      const elapsed = pausedElapsedRef.current + (Date.now() - startTimeRef.current);

      if (targetMs > 0 && elapsed >= targetMs && !expiredRef.current) {
        expiredRef.current = true;
        advance({ announce: true, autoStart: true });
        return;
      }

      // A background tab still updates its title, so this is what tells you the
      // timer is close when the app isn't on screen.
      const remaining = targetMs > 0 ? targetMs - elapsed : elapsed;
      const next = `${remaining < 0 ? '+' : ''}${formatTime(remaining)} · ${baseTitle}`;
      if (document.title !== next) document.title = next;
    };

    tick();
    const id = setInterval(tick, 250);
    return () => {
      clearInterval(id);
      document.title = baseTitle;
    };
  }, [timerState, targetMs, advance, baseTitle]);

  // A countdown whose deadline passed while the tab was closed. Resolved once, on
  // mount, silently - see `advance`. A plain timer stays put and shows its
  // overtime; a pomodoro moves on one block and waits, because auto-starting a
  // block you weren't here for would be a lie about when you started working.
  useEffect(() => {
    if (!restoredExpired) return;
    advance({ announce: false, autoStart: false });
    // Mount only: this is about the session we loaded, not the live one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence ────────────────────────────────────────────────────────────
  //
  // Written on every state transition, never on a tick - the refs are read here
  // because the actions below mutate them synchronously before their setState, so
  // by the time this effect runs they already hold the new values.
  useEffect(() => {
    saveSession({
      mode,
      phase,
      timerState,
      startTime: startTimeRef.current,
      pausedElapsed: pausedElapsedRef.current,
      targetMs,
      cycleIndex,
    });
  }, [mode, phase, timerState, targetMs, cycleIndex]);

  // ── Actions ────────────────────────────────────────────────────────────────

  // Every path into `idle` zeroes `pausedElapsed`, so starting from idle needs no
  // reset of its own; starting from `paused` deliberately keeps it and resumes.
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setTimerState('running');
  }, []);

  const pauseTimer = useCallback(() => {
    pausedElapsedRef.current = pausedElapsedRef.current + (Date.now() - startTimeRef.current);
    setTimerState('paused');
  }, []);

  // Stop and Reset used to be two buttons doing byte-for-byte the same thing.
  // This is the single one, with pomodoro's extra step: restart the current block,
  // and if it's already sitting at full, clear the whole set.
  const resetTimer = useCallback(() => {
    const atFullStop = timerState === 'idle' && pausedElapsedRef.current === 0;
    pausedElapsedRef.current = 0;
    expiredRef.current = false;
    if (mode === 'pomodoro' && atFullStop) {
      setCycleIndex(0);
      setPhase('focus');
      setTargetMs(prefs.focusMs);
    }
    setTimerState('idle');
  }, [mode, timerState, prefs.focusMs]);

  // Blocked while a session is live: silently rebasing the clock mid-block would
  // lose work you're in the middle of. The switcher is disabled to match.
  const setMode = useCallback(
    (m: FocusMode) => {
      if (timerState !== 'idle') return;
      pausedElapsedRef.current = 0;
      expiredRef.current = false;
      setPhase('focus');
      setCycleIndex(0);
      setTargetMs(m === 'timer' ? prefs.timerMs : m === 'pomodoro' ? prefs.focusMs : 0);
      setModeState(m);
    },
    [timerState, prefs.timerMs, prefs.focusMs],
  );

  // Re-arms the announcement: "+5" on a timer already in overtime pulls it back
  // under its target, and it should say so again when it runs out a second time.
  const extendTimer = useCallback((ms: number) => {
    expiredRef.current = false;
    setTargetMs((t) => (t > 0 ? t + ms : t));
  }, []);

  // Picking a duration also remembers it, so timer mode reopens where you left it.
  const setTimerDuration = useCallback((ms: number) => {
    expiredRef.current = false;
    setTargetMs(ms);
    setPrefsState((prev) => ({ ...prev, timerMs: ms }));
  }, []);

  const skipPhase = useCallback(() => {
    advance({ announce: false, autoStart: true });
  }, [advance]);

  // Jumping to a block by hand, from the phase selector. Lands idle so you choose
  // when it starts, and leaves `cycleIndex` alone: taking a break early isn't the
  // same as finishing a focus block, and shouldn't be counted as one.
  const selectPhase = useCallback(
    (next: Phase) => {
      if (mode !== 'pomodoro') return;
      goToPhase(next, false, prefs);
    },
    [mode, prefs, goToPhase],
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────
  //
  // Only while the focus UI is on screen - these are single letters, and binding
  // them globally would hijack typing everywhere else in the app.
  useEffect(() => {
    if (!isStopwatchVisible && !isStopwatchFullscreen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never steal a keystroke from a text field - the custom-duration input.
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;

      if (e.code === 'Space') {
        // Clicking Start leaves that button focused, where Space is already the
        // browser's "activate" key - handling it here too would double-fire.
        // R and Escape have no such conflict, so they stay live.
        if (t?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (timerState === 'running') pauseTimer();
        else startTimer();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetTimer();
      } else if (e.key === 'Escape' && isStopwatchFullscreen) {
        setIsStopwatchFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStopwatchVisible, isStopwatchFullscreen, timerState, startTimer, pauseTimer, resetTimer]);

  return {
    // engine
    mode, setMode,
    phase, cycleIndex,
    targetMs, setTimerDuration, extendTimer,
    prefs, setPrefs,
    timerState,
    startTimeRef, pausedElapsedRef,
    startTimer, pauseTimer, resetTimer, skipPhase, selectPhase,
    pulseKey,
    // chrome
    isStopwatchVisible, setIsStopwatchVisible,
    isStopwatchFullscreen, setIsStopwatchFullscreen,
    ...background,
  };
}

export type StopwatchApi = ReturnType<typeof useProvideFocus>;

const StopwatchContext = createContext<StopwatchApi | null>(null);

export const StopwatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useProvideFocus();
  return <StopwatchContext.Provider value={value}>{children}</StopwatchContext.Provider>;
};

export function useStopwatch(): StopwatchApi {
  const ctx = useContext(StopwatchContext);
  if (!ctx) throw new Error('useStopwatch must be used within a StopwatchProvider');
  return ctx;
}

// Elapsed ms, derived from the running refs with a self-owned 50ms tick. Only the
// component that calls this re-renders each tick - that's the whole point.
export function useElapsed(): number {
  const { timerState, startTimeRef, pausedElapsedRef } = useStopwatch();
  const read = () =>
    timerState === 'running'
      ? pausedElapsedRef.current + (Date.now() - startTimeRef.current)
      : pausedElapsedRef.current;
  const [elapsed, setElapsed] = useState<number>(read);
  useEffect(() => {
    setElapsed(read());
    if (timerState !== 'running') return;
    const id = setInterval(() => {
      setElapsed(pausedElapsedRef.current + (Date.now() - startTimeRef.current));
    }, 50);
    return () => clearInterval(id);
    // refs are stable; re-run only when the run state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState]);
  return elapsed;
}

// What the digits should say, for any mode. Counting down is just `target - elapsed`
// allowed to go negative, which is what makes overtime fall out for free.
export function useFocusDisplay() {
  const { targetMs } = useStopwatch();
  const elapsed = useElapsed();
  const isCountdown = targetMs > 0;
  const displayMs = isCountdown ? targetMs - elapsed : elapsed;
  return {
    displayMs,
    isCountdown,
    isOvertime: isCountdown && displayMs < 0,
    progress: isCountdown ? Math.min(1, elapsed / targetMs) : 0,
  };
}

// The running digits, isolated so the tick re-renders only this node.
//
// The overtime color lives here rather than on the host: a host that reads
// `isOvertime` itself would subscribe to the tick and re-render the entire view
// 20 times a second, which is exactly what this split exists to prevent.
export function FocusTime({ className = '' }: { className?: string }) {
  const { displayMs, isOvertime } = useFocusDisplay();
  return (
    <span className={`${className} transition-colors ${isOvertime ? 'text-xp-bar' : 'text-white'}`}>
      {isOvertime ? '+' : ''}
      {formatTime(displayMs)}
    </span>
  );
}

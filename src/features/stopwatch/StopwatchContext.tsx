import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { TimerState } from '@/features/stopwatch/StopwatchWidget';
import { loadBgImage, migrateLegacyBg, saveBgImage } from '@/features/stopwatch/bgStore';
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

// The stopwatch lives in its own context, separate from the big AppData object.
// Crucially, `elapsed` is NOT stored here - it's derived on demand by `useElapsed()`
// in a leaf, so the 50ms tick re-renders only the digits, not every AppData consumer.
function useProvideStopwatch() {
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [isStopwatchVisible, setIsStopwatchVisible] = useState(false);
  const [isStopwatchFullscreen, setIsStopwatchFullscreen] = useState(false);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const background = useProvideBackground();

  const startTimer = useCallback(() => {
    const now = Date.now();
    setTimerState((prev) => {
      if (prev === 'idle') pausedElapsedRef.current = 0;
      startTimeRef.current = now;
      return 'running';
    });
  }, []);

  const pauseTimer = useCallback(() => {
    pausedElapsedRef.current = pausedElapsedRef.current + (Date.now() - startTimeRef.current);
    setTimerState('paused');
  }, []);

  const stopTimer = useCallback(() => {
    pausedElapsedRef.current = 0;
    setTimerState('idle');
  }, []);

  const resetTimer = useCallback(() => {
    pausedElapsedRef.current = 0;
    setTimerState('idle');
  }, []);

  return {
    timerState,
    startTimeRef,
    pausedElapsedRef,
    startTimer,
    pauseTimer,
    stopTimer,
    resetTimer,
    isStopwatchVisible,
    setIsStopwatchVisible,
    isStopwatchFullscreen,
    setIsStopwatchFullscreen,
    ...background,
  };
}

export type StopwatchApi = ReturnType<typeof useProvideStopwatch>;

const StopwatchContext = createContext<StopwatchApi | null>(null);

export const StopwatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useProvideStopwatch();
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
      : timerState === 'paused'
        ? pausedElapsedRef.current
        : 0;
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

function formatTime(elapsed: number): string {
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// The running digits, isolated so the 50ms tick re-renders only this node.
export function StopwatchTime() {
  return <>{formatTime(useElapsed())}</>;
}

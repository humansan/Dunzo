import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Square, RotateCcw, Maximize2, X } from 'lucide-react';

export type TimerState = 'idle' | 'running' | 'paused';

interface StopwatchWidgetProps {
  timerState: TimerState;
  elapsed: number;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onClose: () => void;
  onMaximize: () => void;
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

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({
  timerState,
  elapsed,
  onStart,
  onPause,
  onStop,
  onReset,
  onClose,
  onMaximize,
}) => {
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgDimness, setBgDimness] = useState<number>(0.3);
  const [bgBlur, setBgBlur] = useState<number>(0);

  // Mirror the background configured in fullscreen mode (persisted in localStorage)
  useEffect(() => {
    const img = localStorage.getItem('dun-sw-bg-image');
    if (img) setBgImage(img);
    const d = localStorage.getItem('dun-sw-bg-dimness');
    if (d) setBgDimness(parseFloat(d));
    const b = localStorage.getItem('dun-sw-bg-blur');
    if (b) setBgBlur(parseFloat(b));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 w-[360px] max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden shadow-2xl shadow-black/40"
      style={{ backgroundImage: 'linear-gradient(135deg, #FF4E50 0%, #F9D423 100%)' }}
    >
      {/* Background image + dimming (mirrors fullscreen settings) */}
      {bgImage && (
        <img
          src={bgImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: `blur(${bgBlur * 12}px)`, transform: `scale(${1 + bgBlur * 0.2})` }}
        />
      )}
      {bgImage && (
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgDimness})` }} />
      )}

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-end gap-1 px-3 pt-3">
        <button
          onClick={onMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          title="Maximize"
        >
          <Maximize2 size={18} />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          title="Hide widget"
        >
          <X size={18} />
        </button>
      </div>

      {/* Timer */}
      <div className="relative z-10 flex flex-col items-center px-6 pb-8">
        <div className="text-white font-bold font-mono tracking-tight text-6xl leading-none py-2">
          {formatTime(elapsed)}
        </div>

        <div className="flex items-center justify-center gap-3 text-sm duration-0">
          {timerState === 'idle' && (
            <button
              onClick={onStart}
              className="flex items-center justify-center gap-2 min-w-25 px-2 py-2 rounded-full bg-white/20 text-white font-bold active:bg-white/10 active:scale-90 cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              <span>Start</span>
            </button>
          )}

          {timerState === 'running' && (
            <>
              <button
                onClick={onPause}
                className="flex items-center justify-center gap-2 min-w-[100px] px-2 py-2 rounded-full bg-white/20 text-white font-semibold active:bg-white/10 active:scale-90 cursor-pointer"
              >
                <Pause size={16} fill="currentColor" />
                <span>Pause</span>
              </button>
              <button
                onClick={onStop}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Stop"
              >
                <Square size={16} fill="currentColor" />
              </button>
              <button
                onClick={onReset}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Reset"
              >
                <RotateCcw size={16} />
              </button>
            </>
          )}

          {timerState === 'paused' && (
            <>
              <button
                onClick={onStart}
                className="flex items-center justify-center gap-2 min-w-[115px] px-2 py-2 rounded-full bg-white/20 text-white font-semibold active:bg-white/10 active:scale-90 cursor-pointer"
              >
                <Play size={16} fill="currentColor" />
                <span>Resume</span>
              </button>
              <button
                onClick={onStop}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Stop"
              >
                <Square size={16} fill="currentColor" />
              </button>
              <button
                onClick={onReset}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Reset"
              >
                <RotateCcw size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

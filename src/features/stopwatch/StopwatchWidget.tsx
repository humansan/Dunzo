import React from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Square, RotateCcw, Maximize2, X } from 'lucide-react';
import { StopwatchTime, useStopwatch } from '@/features/stopwatch/StopwatchContext';

export type TimerState = 'idle' | 'running' | 'paused';

interface StopwatchWidgetProps {
  timerState: TimerState;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onClose: () => void;
  onMaximize: () => void;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({
  timerState,
  onStart,
  onPause,
  onStop,
  onReset,
  onClose,
  onMaximize,
}) => {
  // Shared with the fullscreen view, so a background picked there is already live
  // here. Always an image - the bundled default until the user picks their own.
  const { bgUrl, bgDimness, bgBlur } = useStopwatch();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed bottom-8 left-[calc(50%+1.75rem)] -translate-x-1/2 z-60 w-[360px] max-w-[calc(100vw-2rem)] rounded-3xl overflow-hidden shadow-2xl shadow-black/40"
      style={{ backgroundColor: '#000' }}
    >
      {/* Background image + dimming (mirrors fullscreen settings) */}
      <img
        src={bgUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: `blur(${bgBlur * 12}px)`, transform: `scale(${1 + bgBlur * 0.2})` }}
      />
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgDimness})` }} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-end gap-1 px-3 pt-3">
        <button
          onClick={onMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          title="Maximize"
        >
          <Maximize2 size={18} />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          title="Hide widget"
        >
          <X size={18} />
        </button>
      </div>

      {/* Timer */}
      <div className="relative z-10 flex flex-col items-center px-6 pb-8">
        <div className="text-white font-bold font-mono tracking-tight text-6xl leading-none py-2">
          <StopwatchTime />
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

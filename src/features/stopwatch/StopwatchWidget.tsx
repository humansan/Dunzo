import React from 'react';
import { motion } from 'motion/react';
import { Maximize2, X } from 'lucide-react';
import { FocusTime, useFocusDisplay, useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { FocusControls } from '@/features/stopwatch/ui/FocusControls';

interface StopwatchWidgetProps {
  onClose: () => void;
  onMaximize: () => void;
}

// Progress under the digits. Isolated so the tick re-renders this bar and the
// digits, and nothing else in the card.
const ProgressBar: React.FC = () => {
  const { progress, isCountdown, isOvertime } = useFocusDisplay();
  if (!isCountdown) return null;
  return (
    <div className="w-[80%] h-1 rounded-full bg-white/15 overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-linear ${isOvertime ? 'bg-xp-bar' : 'bg-white/80'}`}
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
};

// The minimized card. Deliberately just the clock: time, progress, play/pause and
// reset. Everything that configures the session - mode, duration, pomodoro
// settings, skip - lives in the fullscreen view, because this thing exists to be
// glanced at while you work on something else, not operated.
//
// Only the close/maximize handlers are props - those are the shell's business.
// Everything about the timer comes from the context this card already used for its
// background.
export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({ onClose, onMaximize }) => {
  const { bgUrl, bgDimness, bgBlur, pulseKey } = useStopwatch();

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
      {/* Dimming is a legibility control for bright images, so it stays exactly
          where you set it - it is not a channel for signaling phase changes. */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgDimness})` }} />

      {/* With no sound in v0, this flash is the primary end-of-phase signal. Keyed
          so each phase end remounts it and replays the fade. */}
      {pulseKey > 0 && (
        <motion.div
          key={pulseKey}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          className="absolute inset-0 bg-white pointer-events-none z-20"
        />
      )}

      {/* Window controls only - they fade back until you go looking for them. */}
      <div className="relative z-10 flex items-center justify-end px-3 pt-3">
        <button
          onClick={onMaximize}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          title="Maximize"
        >
          <Maximize2 size={18} />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          title="Hide widget"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-7">
        <FocusTime className="font-bold font-mono tracking-tight text-6xl leading-none" />
        <ProgressBar />
        <FocusControls size="sm" compact />
      </div>
    </motion.div>
  );
};

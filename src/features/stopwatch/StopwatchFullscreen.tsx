import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Minimize2, X, Image as ImageIcon, Sun, SlidersHorizontal } from 'lucide-react';
import { FocusTime, useFocusDisplay, useStopwatch } from '@/features/stopwatch/StopwatchContext';
import { FocusControls } from '@/features/stopwatch/ui/FocusControls';
import { ModeSwitcher } from '@/features/stopwatch/ui/ModeSwitcher';
import { DurationPicker } from '@/features/stopwatch/ui/DurationPicker';
import { FocusConfigPanel } from '@/features/stopwatch/ui/FocusConfigPanel';
import { CycleDots, PhaseSelector } from '@/features/stopwatch/ui/PomodoroBits';
import { focusHeaderBtn, focusPanel } from '@/features/stopwatch/ui/focusUi';

interface StopwatchFullscreenProps {
  onMinimize: () => void;
  onClose: () => void;
}

const Slider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <input
    type="range"
    min={0}
    max={1}
    step={0.01}
    value={value}
    onChange={(e) => onChange(parseFloat(e.target.value))}
    className="w-56 h-2 appearance-none cursor-pointer rounded-full bg-white/20 accent-white
      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
  />
);

// Isolated so the tick re-renders only the bar, not the whole fullscreen view.
const ProgressBar: React.FC = () => {
  const { progress, isCountdown, isOvertime } = useFocusDisplay();
  if (!isCountdown) return null;
  return (
    <div className="w-full max-w-2xl h-2 rounded-full bg-white/15 overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-linear ${isOvertime ? 'bg-xp-bar' : 'bg-white/85'}`}
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
};

export const StopwatchFullscreen: React.FC<StopwatchFullscreenProps> = ({ onMinimize, onClose }) => {
  // The background is shared with the widget and persisted by the context (image in
  // IndexedDB, dimness/blur in localStorage). Always an image - the bundled default
  // until the user picks their own; black shows only while it loads / if it fails.
  const {
    bgUrl, bgDimness, bgBlur, bgError, setBgImage, setBgDimness, setBgBlur,
    mode, timerState, pulseKey,
  } = useStopwatch();
  // Two popovers share the header; opening one closes the other so they can't
  // overlap in the same corner.
  const [panel, setPanel] = useState<'none' | 'background' | 'focus'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // A File is a Blob, so it goes to IndexedDB as-is - no base64 conversion.
    if (file) setBgImage(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{ backgroundColor: '#000' }}
    >
      {/* Background image + dimming */}
      <img
        src={bgUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: `blur(${bgBlur * 50}px)`, transform: `scale(${1 + bgBlur * 0.2})` }}
      />
      {/* Dimming is a legibility control for bright images, so it stays exactly
          where you set it - it is not a channel for signaling phase changes. */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgDimness})` }} />

      {/* End-of-phase flash - the primary signal, since v0 has no sound. */}
      {pulseKey > 0 && (
        <motion.div
          key={pulseKey}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
          className="absolute inset-0 bg-white pointer-events-none z-30"
        />
      )}

      {/* Header row - sits in normal flow at the top so the timer below it reads as
          vertically centered (mirrors Tick's layout) */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-5">
        {/* Left: image + settings controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={focusHeaderBtn}
            title="Set background image"
          >
            <ImageIcon size={26} />
          </button>
          <button
            onClick={() => setPanel((p) => (p === 'background' ? 'none' : 'background'))}
            className={focusHeaderBtn}
            title="Background settings"
          >
            <Sun size={24} />
          </button>
          <button
            onClick={() => setPanel((p) => (p === 'focus' ? 'none' : 'focus'))}
            className={focusHeaderBtn}
            title="Timer settings"
          >
            <SlidersHorizontal size={24} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />
        </div>

        {/* Center: mode */}
        <ModeSwitcher size="lg" />

        {/* Right: minimize + close */}
        <div className="flex items-center gap-2">
          <button onClick={onMinimize} className={focusHeaderBtn} title="Minimize to widget">
            <Minimize2 size={24} />
          </button>
          <button onClick={onClose} className={focusHeaderBtn} title="Close">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Settings popovers - float below the header without affecting layout */}
      {panel === 'background' && (
        <div className={`absolute top-20 left-5 z-20 p-5 ${focusPanel}`}>
          <p className="text-white text-sm font-semibold mb-2">Background Dimness</p>
          <Slider value={bgDimness} onChange={setBgDimness} />
          <p className="text-white text-sm font-semibold mt-5 mb-2">Background Blur</p>
          <Slider value={bgBlur} onChange={setBgBlur} />
        </div>
      )}
      {panel === 'focus' && (
        <div className="absolute top-20 left-5 z-20">
          <FocusConfigPanel />
        </div>
      )}

      {/* A failed save used to be invisible - the image showed until the next remount,
          then silently reverted. Now it says so. */}
      {bgError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 text-white text-sm">
          {bgError}
        </div>
      )}

      {/* Timer - flex-1 region below the header, centers the time + controls */}
      <div className="relative z-[5] flex-1 flex flex-col justify-center px-6">
        <div className={`flex flex-col items-center justify-start gap-6`} >
          <PhaseSelector size="lg" />

          <FocusTime className="font-bold font-mono tracking-tight leading-none text-center text-[clamp(4rem,18vw,11rem)]" />

          <ProgressBar />
          <CycleDots size="lg" />

          {mode === 'timer' && timerState === 'idle' && <DurationPicker size="lg" />}

          <FocusControls size="lg" />
        </div>
      </div>
    </motion.div>
  );
};

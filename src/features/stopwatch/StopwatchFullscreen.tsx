import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Square, RotateCcw, Minimize2, X, Image as ImageIcon, Sun } from 'lucide-react';
import { TimerState } from '@/features/stopwatch/StopwatchWidget';
import { StopwatchTime, useStopwatch } from '@/features/stopwatch/StopwatchContext';

interface StopwatchFullscreenProps {
  timerState: TimerState;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
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

export const StopwatchFullscreen: React.FC<StopwatchFullscreenProps> = ({
  timerState,
  onStart,
  onPause,
  onStop,
  onReset,
  onMinimize,
  onClose,
}) => {
  // The background is shared with the widget and persisted by the context (image in
  // IndexedDB, dimness/blur in localStorage). Always an image - the bundled default
  // until the user picks their own; black shows only while it loads / if it fails.
  const { bgUrl, bgDimness, bgBlur, bgError, setBgImage, setBgDimness, setBgBlur } = useStopwatch();
  const [showSettings, setShowSettings] = useState(false);
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
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgDimness})` }} />

      {/* Header row - sits in normal flow at the top so the timer below it reads as
          vertically centered (mirrors Tick's layout) */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-5">
        {/* Left: image + settings controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Set background image"
          >
            <ImageIcon size={26} />
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Background settings"
          >
            <Sun size={24} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />
        </div>

        {/* Right: minimize + close */}
        <div className="flex items-center gap-2">
          <button
            onClick={onMinimize}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Minimize to widget"
          >
            <Minimize2 size={24} />
          </button>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Settings dropdown - floats below the header without affecting layout */}
      {showSettings && (
        <div className="absolute top-20 left-5 z-20 p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-white/10 shadow-2xl">
          <p className="text-white text-sm font-semibold mb-2">Background Dimness</p>
          <Slider value={bgDimness} onChange={setBgDimness} />
          <p className="text-white text-sm font-semibold mt-5 mb-2">Background Blur</p>
          <Slider value={bgBlur} onChange={setBgBlur} />
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
      <div className="relative z-[5] flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-white font-bold font-mono tracking-tight leading-none text-center text-[clamp(4rem,18vw,11rem)] font-[">
          <StopwatchTime />
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-base duration-0">
          {timerState === 'idle' && (
            <button
              onClick={onStart}
              className="flex items-center justify-center gap-2 min-w-30 px-2 py-2.5 rounded-full bg-white/20 text-white font-bold active:bg-white/10 active:scale-90 cursor-pointer"
            >
              <Play size={20} fill="currentColor" />
              <span>Start</span>
            </button>
          )}

          {timerState === 'running' && (
            <>
              <button
                onClick={onPause}
                className="flex items-center justify-center gap-2 min-w-30 px-2 py-2.5 rounded-full bg-white/20 text-white font-semibold active:bg-white/10 active:scale-90 cursor-pointer"
              >
                <Pause size={20} fill="currentColor" />
                <span>Pause</span>
              </button>
              <button
                onClick={onStop}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white transition-colors active:bg-white/10 active:scale-90 cursor-pointer"
                title="Stop"
              >
                <Square size={20} fill="currentColor" />
              </button>
              <button
                onClick={onReset}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white transition-colors active:bg-white/10 active:scale-90 cursor-pointer"
                title="Reset"
              >
                <RotateCcw size={20} />
              </button>
            </>
          )}

          {timerState === 'paused' && (
            <>
              <button
                onClick={onStart}
                className="flex items-center justify-center gap-2 min-w-35 px-2 py-2.5 rounded-full bg-white/20 text-white font-semibold active:bg-white/10 active:scale-90 cursor-pointer"
              >
                <Play size={20} fill="currentColor" />
                <span>Resume</span>
              </button>
              <button
                onClick={onStop}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Stop"
              >
                <Square size={20} fill="currentColor" />
              </button>
              <button
                onClick={onReset}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white active:bg-white/10 active:scale-90 cursor-pointer"
                title="Reset"
              >
                <RotateCcw size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

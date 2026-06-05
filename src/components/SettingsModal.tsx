import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings } from 'lucide-react';
import { Theme } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  weekStartsOn: number;
  onUpdateWeekStartsOn: (val: number) => void;
  countdownMode: 'off' | 'time' | 'percent';
  onUpdateCountdownMode: (val: 'off' | 'time' | 'percent') => void;
  xpEnabled: boolean;
  onUpdateXpEnabled: (val: boolean) => void;
  theme: Theme;
  onUpdateTheme: (theme: Theme) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  onUpdateXpEnabled,
  theme,
  onUpdateTheme,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const sectionLabel = (text: string) => (
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">{text}</p>
  );

  const toggleBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 rounded-xl text-xs font-bold transition-all ${
        active
          ? 'bg-[var(--accent2)] text-black shadow-lg shadow-[var(--accent2)]/10'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="w-[380px] bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 shadow-2xl relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2 mb-6">
              <Settings size={15} className="text-white/40" />
              <h2 className="text-white font-bold text-base">Settings</h2>
            </div>

            <div className="space-y-6">
              {/* ── Tasks ─────────────────────────────────── */}
              {sectionLabel('Tasks')}

              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">First Day of Week</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateWeekStartsOn(0)}
                    className={`py-2 rounded-xl text-sm font-bold transition-all ${weekStartsOn === 0 ? 'bg-[var(--accent2)] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                  >
                    Sunday
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateWeekStartsOn(1)}
                    className={`py-2 rounded-xl text-sm font-bold transition-all ${weekStartsOn === 1 ? 'bg-[var(--accent2)] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                  >
                    Monday
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Deadline Countdown</label>
                <div className="grid grid-cols-3 gap-2 bg-black/20 p-1 rounded-2xl border border-white/5">
                  {toggleBtn(countdownMode === 'off',     () => onUpdateCountdownMode('off'),     'Off')}
                  {toggleBtn(countdownMode === 'time',    () => onUpdateCountdownMode('time'),    'Time Left')}
                  {toggleBtn(countdownMode === 'percent', () => onUpdateCountdownMode('percent'), 'Percent Left')}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-widest">XP & Streaks</label>
                  <p className="text-[11px] text-white/30 mt-0.5">Show XP, progress bar and streak stars</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={xpEnabled}
                  onClick={() => onUpdateXpEnabled(!xpEnabled)}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
                    xpEnabled ? 'bg-[var(--accent2)]' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      xpEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* ── Appearance ────────────────────────────── */}
              <div className="border-t border-white/5 pt-5">
                {sectionLabel('Appearance')}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Accent Color 1</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={theme.accent1}
                        onChange={(e) => onUpdateTheme({ ...theme, accent1: e.target.value })}
                        className="w-10 h-10 bg-transparent border-none cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={theme.accent1}
                        onChange={(e) => onUpdateTheme({ ...theme, accent1: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent1)] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Accent Color 2</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={theme.accent2}
                        onChange={(e) => onUpdateTheme({ ...theme, accent2: e.target.value })}
                        className="w-10 h-10 bg-transparent border-none cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={theme.accent2}
                        onChange={(e) => onUpdateTheme({ ...theme, accent2: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent2)] transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateTheme({ accent1: '#e9ec6a', accent2: '#a2beb7' })}
                    className="w-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-bold py-2.5 rounded-xl transition-all"
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

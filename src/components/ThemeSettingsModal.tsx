import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Palette } from 'lucide-react';
import { Theme } from '../types';

interface ThemeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onUpdate: (theme: Theme) => void;
}

export const ThemeSettingsModal: React.FC<ThemeSettingsModalProps> = ({ isOpen, onClose, theme, onUpdate }) => {
  const [accent1, setAccent1] = useState(theme.accent1);
  const [accent2, setAccent2] = useState(theme.accent2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({ accent1, accent2 });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <Palette className="text-white/60" size={20} />
                <h2 className="text-xl font-bold text-white">Theme Settings</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Accent Color 1 (Primary UI)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={accent1}
                    onChange={(e) => setAccent1(e.target.value)}
                    className="w-12 h-12 bg-transparent border-none cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accent1}
                    onChange={(e) => setAccent1(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Accent Color 2 (Secondary UI)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={accent2}
                    onChange={(e) => setAccent2(e.target.value)}
                    className="w-12 h-12 bg-transparent border-none cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accent2}
                    onChange={(e) => setAccent2(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAccent1('#e9ec6a');
                    setAccent2('#a2beb7');
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-bold py-4 rounded-2xl transition-all"
                >
                  Reset Defaults
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-white text-black font-bold py-4 rounded-2xl transition-all transform active:scale-[0.98]"
                  style={{ backgroundColor: accent1 }}
                >
                  Apply Theme
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

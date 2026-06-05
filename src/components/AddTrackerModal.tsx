import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Tracker, TrackerType, TrackerDisplayMode, TrackerSecondaryDisplayMode } from '../types';

interface AddTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (tracker: Tracker) => void;
  editingTracker?: Tracker | null;
}

export const AddTrackerModal: React.FC<AddTrackerModalProps> = ({ isOpen, onClose, onAdd, editingTracker }) => {
  const [name, setName] = useState(editingTracker?.name || '');
  const [type, setType] = useState<TrackerType>(editingTracker?.type || 'day');
  const [startDate, setStartDate] = useState(editingTracker?.startDate ? format(new Date(editingTracker.startDate), 'yyyy-MM-dd') : '');
  const [endDate, setEndDate] = useState(editingTracker?.endDate ? format(new Date(editingTracker.endDate), 'yyyy-MM-dd') : '');
  const [color, setColor] = useState(editingTracker?.color || '#e9ec6a');
  const [precision, setPrecision] = useState(editingTracker?.precision || 2);
  const [displayMode, setDisplayMode] = useState<TrackerDisplayMode>(editingTracker?.displayMode || 'percent_elapsed');
  const [secondaryDisplayMode, setSecondaryDisplayMode] = useState<TrackerSecondaryDisplayMode>(editingTracker?.secondaryDisplayMode ?? 'time_remaining');

  useEffect(() => {
    if (isOpen) {
      setName(editingTracker?.name || '');
      setType(editingTracker?.type || 'day');
      setStartDate(editingTracker?.startDate ? format(new Date(editingTracker.startDate), 'yyyy-MM-dd') : '');
      setEndDate(editingTracker?.endDate ? format(new Date(editingTracker.endDate), 'yyyy-MM-dd') : '');
      setColor(editingTracker?.color || '#e9ec6a');
      setPrecision(editingTracker?.precision || 2);
      setDisplayMode(editingTracker?.displayMode || 'percent_elapsed');
      setSecondaryDisplayMode(editingTracker?.secondaryDisplayMode ?? 'time_remaining');
    }
  }, [isOpen, editingTracker]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: editingTracker?.id || Math.random().toString(36).substr(2, 9),
      name: name || type.toUpperCase(),
      type,
      startDate: type === 'custom' ? new Date(startDate + 'T00:00:00').toISOString() : undefined,
      endDate: type === 'custom' ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
      color,
      precision,
      displayMode,
      secondaryDisplayMode,
      createdAt: editingTracker?.createdAt || Date.now()
    });
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
            className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Sticky header */}
            <div className="flex justify-between items-center px-6 pt-5 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-white">
                {editingTracker ? 'Edit Tracker' : 'New Tracker'}
              </h2>
              <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-white/40">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto px-6 pb-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Name (Optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Project"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent1)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Interval</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['day', 'week', 'month', 'year', 'custom'] as TrackerType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        type === t
                          ? 'bg-[var(--accent1)] text-black'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {type === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent1)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">End Date</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent1)]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 bg-transparent border-none cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[var(--accent1)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Precision</label>
                <select
                  value={precision}
                  onChange={(e) => setPrecision(parseInt(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent1)]"
                >
                  {[0, 1, 2, 3, 4].map(p => (
                    <option key={p} value={p} className="bg-[#1A1A1A]">{p} digits</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Primary Value</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { key: 'percent_elapsed' as TrackerDisplayMode, label: '% Elapsed' },
                    { key: 'percent_remaining' as TrackerDisplayMode, label: '% Remaining' },
                    { key: 'time_elapsed' as TrackerDisplayMode, label: 'Time Elapsed' },
                    { key: 'time_remaining' as TrackerDisplayMode, label: 'Time Left' },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setDisplayMode(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        displayMode === opt.key
                          ? 'bg-[var(--accent1)] text-black'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Secondary Value</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { key: 'percent_elapsed' as TrackerSecondaryDisplayMode, label: '% Elapsed' },
                    { key: 'percent_remaining' as TrackerSecondaryDisplayMode, label: '% Remaining' },
                    { key: 'time_elapsed' as TrackerSecondaryDisplayMode, label: 'Time Elapsed' },
                    { key: 'time_remaining' as TrackerSecondaryDisplayMode, label: 'Time Left' },
                    { key: 'none' as TrackerSecondaryDisplayMode, label: 'None' },
                  ]).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSecondaryDisplayMode(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        secondaryDisplayMode === opt.key
                          ? 'bg-[var(--accent1)] text-black'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold py-3 rounded-2xl transition-all transform active:scale-[0.98]"
              >
                {editingTracker ? 'Save Changes' : 'Create Tracker'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { Tracker, TrackerType, TrackerDisplayMode, TrackerSecondaryDisplayMode } from '../types';
import { ListSelect } from './todosHub/ListSelect';
import { textInputCls } from './todosHub/TextInput';
import { modalPop } from './modalMotion';

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
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            {...modalPop}
            className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Sticky header */}
            <div className="flex justify-between items-center px-6 pt-5 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-white">
                {editingTracker ? 'Edit Tracker' : 'New Tracker'}
              </h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 transition-all hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto px-6 pb-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Project"
                  className={`${textInputCls} w-full`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Interval</label>
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
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={`${textInputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">End Date</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={`${textInputCls} w-full`}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-8 bg-transparent border border-white/10 rounded-lg cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className={`${textInputCls} flex-1 font-mono`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Precision</label>
                <ListSelect
                  ariaLabel="Precision"
                  className="w-full"
                  value={String(precision)}
                  onChange={(v) => setPrecision(parseInt(v))}
                  options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: `${p} digits` }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Primary Value</label>
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
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Secondary Value</label>
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
                className="w-full bg-[var(--accent1)] hover:opacity-90 text-black font-bold py-3 rounded-2xl transition-all transform active:scale-[0.98] text-sm"
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

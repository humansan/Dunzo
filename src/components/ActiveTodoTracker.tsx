import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Todo } from '../types';
import { parse, differenceInSeconds, startOfDay } from 'date-fns';

interface ActiveTodoTrackerProps {
  todo: Todo;
  onClose: () => void;
  onToggle: () => void;
}

export const ActiveTodoTracker: React.FC<ActiveTodoTrackerProps> = ({ todo, onClose, onToggle }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!todo.dueTime || !todo.trackingStartedAt) {
      setProgress(0);
      return;
    }

    const updateProgress = () => {
      const now = new Date();
      const startTime = todo.trackingStartedAt!;

      // Parse the due time (e.g. "12:00") for today
      const [hours, minutes] = todo.dueTime!.split(':').map(Number);
      const dueDateTime = startOfDay(now);
      dueDateTime.setHours(hours, minutes, 0, 0);

      const totalDuration = differenceInSeconds(dueDateTime, new Date(startTime));
      const elapsed = differenceInSeconds(now, new Date(startTime));

      if (totalDuration <= 0) {
        setProgress(100);
      } else {
        const p = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        setProgress(p);
      }
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [todo]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="relative w-full max-w-xl bg-[#141414] border border-white/5 rounded-3xl p-4 shadow-2xl overflow-hidden group"
    >
      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 p-1.5 bg-black/40 hover:bg-black/60 text-white/40 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100 z-20 border border-white/10"
      >
        <X size={14} />
      </button>

      <div className="flex items-center gap-4 relative z-10 pr-10">
        <button 
          onClick={onToggle}
          className={`transition-colors ${todo.completed ? 'text-[var(--accent1)]' : 'text-white hover:text-[var(--accent1)]'}`}
        >
          {todo.completed ? <CheckCircle2 size={24} /> : <Circle size={24} strokeWidth={2.5} />}
        </button>

        <div className="flex-1 min-w-0">
          <h3 className={`text-lg font-medium transition-all ${todo.completed ? 'text-white/20 line-through' : 'text-white'}`}>
            {todo.text}
          </h3>
        </div>

        {(todo.dueTime || todo.duePercentage !== undefined) && (
          <div className="flex items-center gap-2 px-3 py-1 bg-[var(--accent1)] rounded-lg shadow-lg shadow-[var(--accent1)]/10">
            {todo.dueTime && (
              <div className="flex items-center gap-1.5 text-[13px] font-mono font-bold text-black">
                <Clock size={14} />
                {todo.dueTime}
              </div>
            )}
            {todo.dueTime && todo.duePercentage !== undefined && (
              <div className="w-px h-3 bg-black/20" />
            )}
            {todo.duePercentage !== undefined && (
              <div className="text-[13px] font-mono font-bold text-black">
                {todo.duePercentage}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress Bar Container */}
      {todo.dueTime && todo.trackingStartedAt && (
        <div className="mt-4 h-1.5 bg-white/5 rounded-full relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: "linear" }}
            className="absolute inset-y-0 left-0 bg-[var(--accent1)] rounded-full shadow-[0_0_8px_rgba(163,230,53,0.3)]"
          />
        </div>
      )}
    </motion.div>
  );
};

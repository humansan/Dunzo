import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2, Circle } from 'lucide-react';
import { Todo } from '@shared/types';
import { isDone } from '@/features/tasks/model';
import { differenceInSeconds, startOfDay } from 'date-fns';
import { TaskTimeChips, formatCountdown, CountdownMode } from '@/features/tasks';
import { EXPO_OUT } from '@/common/ui/motion';
import { btnGhost } from '@/theme/buttons';

interface ActiveTodoTrackerProps {
  todo: Todo;
  onClose: () => void;
  onToggle: () => void;
  /** The user's countdown preference; the tracker always shows a countdown, so
   *  'off' falls back to the time format. */
  countdownMode?: CountdownMode;
}

export const ActiveTodoTracker: React.FC<ActiveTodoTrackerProps> = ({
  todo,
  onClose,
  onToggle,
  countdownMode = 'off',
}) => {
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Tick once a second so the countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // The tracker always shows a countdown, regardless of the global setting.
  const countdown = formatCountdown(todo, todo.dueDate, now, countdownMode === 'off' ? 'time' : countdownMode);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.1 }}
      className="fixed bottom-8 left-[calc(50%+1.75rem)] -translate-x-1/2 z-60 w-[36rem] max-w-[calc(100vw-2rem)] bg-surface border border-line-subtle rounded-3xl p-4 shadow-2xl shadow-black/40 overflow-hidden group"
    >

      <div className="flex items-center gap-2 relative">
        <button
          onClick={onToggle}
          className={`shrink-0 transition-colors ${isDone(todo) ? 'text-(--accent1)' : 'text-fg hover:text-(--accent1)'}`}
        >
          {isDone(todo) ? <CheckCircle2 size={24} /> : <Circle size={24} strokeWidth={2.5} />}
        </button>

        <div className="flex-1 min-w-0">
          <h3 className={`font-medium text-wrap transition-all ${isDone(todo) ? 'text-fg-ghost line-through' : 'text-fg'}`}>
            {todo.text || 'Untitled'}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <TaskTimeChips todo={todo} countdown={countdown} variant="inverted" done={isDone(todo)} />
        </div>

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`h-[27px] w-[27px] rounded-lg flex justify-center items-center group-hover:opacity-100 opacity-0 ${btnGhost()}`}
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress Bar Container */}
      {todo.dueTime && todo.trackingStartedAt && (
        <div className="mt-4 h-1.5 bg-fill-subtle rounded-full relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: EXPO_OUT }}
            className="absolute inset-y-0 left-0 bg-(--accent1) rounded-full shadow-[0_0_8px_rgba(163,230,53,0.3)]"
          />
        </div>
      )}
    </motion.div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Tracker, TrackerDisplayMode } from '@shared/types';
import { calculateProgress, getOrdinal } from '@/common/lib/time';
import { btnGhost } from '@/theme/buttons';
import { Trash2, Settings2 } from 'lucide-react';
import { EXPO_OUT } from '@/common/ui/motion';

interface TrackerCardProps {
  tracker: Tracker;
  onDelete: (id: string) => void;
  onEdit: (tracker: Tracker) => void;
}


export const TrackerCard: React.FC<TrackerCardProps> = ({ tracker, onDelete, onEdit }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const data = calculateProgress(tracker, now);
  const mode: TrackerDisplayMode = tracker.displayMode || 'percent_elapsed';

  const { mainValue, mainSuffix } = useMemo(() => {
    switch (mode) {
      case 'percent_elapsed': {
        const str = data.percentage.toFixed(tracker.precision);
        const [w, d] = str.split('.');
        return { mainValue: w, mainSuffix: d ? `.${d}%` : '%' };
      }
      case 'percent_remaining': {
        const str = data.percentRemaining.toFixed(tracker.precision);
        const [w, d] = str.split('.');
        return { mainValue: w, mainSuffix: d ? `.${d}%` : '%' };
      }
      case 'time_remaining':
        return { mainValue: null, mainSuffix: null };
      case 'time_elapsed':
        return { mainValue: null, mainSuffix: null };
      default: {
        const str = data.percentage.toFixed(tracker.precision);
        const [w, d] = str.split('.');
        return { mainValue: w, mainSuffix: d ? `.${d}%` : '%' };
      }
    }
  }, [mode, data, tracker.precision]);

  const secondaryMode = tracker.secondaryDisplayMode ?? 'time_remaining';
  const secondaryText = useMemo(() => {
    switch (secondaryMode) {
      case 'percent_elapsed':   return `${data.percentage.toFixed(tracker.precision)}% elapsed`;
      case 'percent_remaining': return `${data.percentRemaining.toFixed(tracker.precision)}% remaining`;
      case 'time_elapsed':      return data.timeElapsed;
      case 'time_remaining':    return data.timeLeft;
      case 'none':              return null;
    }
  }, [secondaryMode, data, tracker.precision]);

  const dayOfMonth = now.getDate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative group bg-surface-raised p-4 rounded-2xl overflow-hidden flex flex-col"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className={`text-xs font-bold mb-0.5`} style={{ color: tracker.color }}>
            {data.label}
          </h3>
          <p className="text-fg-faint text-[11px] font-medium">
            {data.subLabel}
          </p>
          {secondaryText && (
            <p className="text-[var(--accent2)] text-[11px] font-medium mt-0.5">
              {secondaryText}
            </p>
          )}
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(tracker)}
            className={`p-1.5 rounded-lg ${btnGhost()}`}
          >
            <Settings2 size={12} />
          </button>
          <button
            onClick={() => onDelete(tracker.id)}
            className="p-1.5 hover:bg-red-500/10 rounded-lg text-fg-faint hover:text-red-400 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="mt-auto flex items-baseline gap-0.5 mb-2">
        {mainValue !== null ? (
          <>
            <span className="text-4xl font-bold tracking-tighter" style={{ color: tracker.color }}>
              {mainValue}
            </span>
            <span className="text-[1.6rem] font-bold tracking-tighter" style={{ color: tracker.color }}>
              {mainSuffix}
            </span>
          </>
        ) : (
          <span className="text-[21px] font-bold tracking-tight" style={{ color: tracker.color }}>
            {mode === 'time_remaining' ? data.timeLeft : data.timeElapsed}
          </span>
        )}

        <div className="ml-auto text-fg-ghost text-xs font-medium italic">
          {/* {getOrdinal(dayOfMonth)} */}
        </div>
      </div>

      {/* <div className="absolute inset-x-0 bottom-0 h-1.25 bg-fill-subtle"> 
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${data.percentage}%` }}
          transition={{ duration: 0.5, ease: EXPO_OUT }}
          className="h-full"
          style={{
            backgroundColor: tracker.color,
            boxShadow: `0 0 16px ${tracker.color}30`
          }}
        />
      </div> */}

      {/*OLD STYLE*/}
      <div className="relative h-1.25 w-full bg-fill-subtle">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${data.percentage}%` }}
          transition={{ duration: 0.5, ease: EXPO_OUT }}
          className="h-full relative z-10"
          style={{
            backgroundColor: tracker.color,
            boxShadow: `0 0 6px ${tracker.color}40`
          }}
        />
      </div>
     
    </motion.div>
  );
};

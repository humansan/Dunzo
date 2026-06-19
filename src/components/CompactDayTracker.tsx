import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { calculateProgress } from '../utils/timeUtils';
import { format } from 'date-fns';

export const CompactDayTracker: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dayTracker = {
    id: 'day-tracker',
    name: 'Day',
    type: 'day' as const,
    color: 'var(--accent1)',
    precision: 2,
    createdAt: Date.now(),
  };

  const data = calculateProgress(dayTracker, now);
  const percentageStr = data.percentage.toFixed(2);
  const [whole, decimal] = percentageStr.split('.');

  return (
    <div className="bg-[#1A1A1A] p-5 rounded-3xl border border-white/5 shadow-xl mb-8">
      <div className="text-center mb-2">
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider">
          {format(now, 'EEEE, MMMM do yyyy')}
        </p>
      </div>
      
      <div className="flex justify-between items-end mb-4 px-1">
        <div className="text-white/80 font-mono text-3xl font-bold tracking-tighter">
          {format(now, 'HH:mm:ss')}
        </div>
        <div className="flex items-baseline gap-0.5 text-[var(--accent1)]">
          <span className="text-5xl font-bold tracking-tighter">{whole}</span>
          <span className="text-4xl font-bold tracking-tighter">.{decimal}%</span>
        </div>
      </div>

      <div className="relative h-2.5 w-full bg-white/5 rounded-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${data.percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-[var(--accent1)] rounded-full shadow-[0_0_8px_rgba(163,230,53,0.3)]"
        />
      </div>
    </div>
  );
};

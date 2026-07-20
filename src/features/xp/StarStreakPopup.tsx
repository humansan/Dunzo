import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DayTodos } from '@shared/types';
import { computeStarStreak } from '@/features/xp/model/xp';
import { useDelayedValue } from '@/common/hooks/useDelayedValue';
import { StarStreak } from '@/features/xp/StarStreak';

interface StarStreakPopupProps {
  dayTodos: DayTodos[];
  date: string;
}

// Timing (ms). The container pops in once the XP count-up has landed; the stars
// inside light up a beat later, so the celebration reads as "popup appears, THEN
// the stars burst" rather than everything at once.
const XP_MS = 1000;          // Xp count-up duration (see XpProgressBar)
const BURST_LEAD = 300;      // gap between the container appearing and the stars firing
const INNER_DELAY = XP_MS + BURST_LEAD; // when the embedded StarStreak lights up
const VISIBLE_MS = 2800;     // how long the popup stays up after it appears

// A centered, transient celebration shown when a new star is earned. It reuses the
// real StarStreak widget: the embedded copy mounts still-unlit (its dayTodos lag a
// touch further behind the trigger), then flips to the earned state while mounted,
// so StarStreak's own burst animation plays inside the popup with no extra code.
const StarStreakPopupBase: React.FC<StarStreakPopupProps> = ({ dayTodos, date }) => {
  // Trigger the popup once the XP animation has finished; light the embedded stars
  // a moment after that.
  const triggerTodos = useDelayedValue(dayTodos, XP_MS);
  const innerTodos = useDelayedValue(dayTodos, INNER_DELAY);

  const triggerStars = useMemo(
    () => computeStarStreak(triggerTodos, date).stars,
    [triggerTodos, date]
  );

  const prevStars = useRef(triggerStars);
  const prevDate = useRef(date);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Navigating between days isn't an achievement - reset, never celebrate.
    if (prevDate.current !== date) {
      prevDate.current = date;
      prevStars.current = triggerStars;
      return;
    }
    if (triggerStars > prevStars.current) {
      setShow(true);
      const t = setTimeout(() => setShow(false), VISIBLE_MS);
      prevStars.current = triggerStars;
      return () => clearTimeout(t);
    }
    prevStars.current = triggerStars;
  }, [triggerStars, date]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.1, 1], opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          >
            <StarStreak dayTodos={innerTodos} date={date} pinned={false} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const StarStreakPopup = React.memo(StarStreakPopupBase);

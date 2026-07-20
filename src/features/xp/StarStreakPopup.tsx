import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DayTodos } from '@shared/types';
import { computeStarStreak } from '@/features/xp/model/xp';
import { useDelayedValue } from '@/common/hooks/useDelayedValue';
import { StarStreak } from '@/features/xp/StarStreak';
import { overlayBackdrop } from '@/common/ui/modalMotion';

interface StarStreakPopupProps {
  dayTodos: DayTodos[];
  date: string;
}

// Timing (ms). The container pops in once the XP count-up has landed; the stars
// inside light up a beat later, so the celebration reads as "popup appears, THEN
// the stars burst" rather than everything at once.
const XP_MS = 600;          // Xp count-up duration (see XpProgressBar)
const BURST_LEAD = 600;      // gap between the container appearing and the stars firing
const VISIBLE_MS = 1800;     // how long the popup stays up after it appears

// A centered, transient celebration shown when a new star is earned. It reuses the
// real StarStreak widget: the embedded copy mounts at the PRE-EARN snapshot (stars
// unlit), then flips to the earned state a beat later, so StarStreak's own off→on
// burst fires inside the popup with no extra code. We feed it an explicit snapshot
// rather than a further-delayed value because a quick uncheck→recheck cancels the
// delayed value's intermediate unlit step, leaving the stars mounted already-lit.
const StarStreakPopupBase: React.FC<StarStreakPopupProps> = ({ dayTodos, date }) => {
  // Trigger the popup once the XP animation has finished.
  const triggerTodos = useDelayedValue(dayTodos, XP_MS);

  const triggerStars = useMemo(
    () => computeStarStreak(triggerTodos, date).stars,
    [triggerTodos, date]
  );

  const prevStars = useRef(triggerStars);
  const prevDate = useRef(date);
  // The last trigger snapshot, kept in step with prevStars: when a star is earned
  // this is the pre-earn state (the newly-lit star still off), so the embedded
  // widget can mount unlit and then transition.
  const prevTriggerTodos = useRef(triggerTodos);
  const [show, setShow] = useState(false);
  // dayTodos fed to the embedded StarStreak: the pre-earn snapshot at mount, then
  // the earned state after BURST_LEAD so the burst plays.
  const [innerTodos, setInnerTodos] = useState(triggerTodos);

  useEffect(() => {
    // Navigating between days isn't an achievement - reset, never celebrate.
    if (prevDate.current !== date) {
      prevDate.current = date;
      prevStars.current = triggerStars;
      prevTriggerTodos.current = triggerTodos;
      return;
    }
    if (triggerStars > prevStars.current) {
      const earned = triggerTodos;
      setInnerTodos(prevTriggerTodos.current); // mount unlit (pre-earn snapshot)
      setShow(true);
      const lightT = setTimeout(() => setInnerTodos(earned), BURST_LEAD); // flip → burst
      const hideT = setTimeout(() => setShow(false), VISIBLE_MS);
      prevStars.current = triggerStars;
      prevTriggerTodos.current = triggerTodos;
      return () => { clearTimeout(lightT); clearTimeout(hideT); };
    }
    prevStars.current = triggerStars;
    prevTriggerTodos.current = triggerTodos;
  }, [triggerStars, triggerTodos, date]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`fixed inset-0 z-[60] flex items-center justify-center pointer-events-none ${overlayBackdrop}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.1, 1], opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          > */}
            <StarStreak dayTodos={innerTodos} date={date} pinned={false} />
          {/* </motion.div> */}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const StarStreakPopup = React.memo(StarStreakPopupBase);

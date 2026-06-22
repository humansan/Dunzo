import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Astroid } from 'lucide-react';
import { DayTodos } from '../types';
import { computeStarStreak } from '../utils/xpUtils';
import { ParticleBurst } from './ParticleBurst';

interface StarStreakProps {
  dayTodos: DayTodos[];
  date: string;
}

const GOLD = '#ffc24b';

// Snappy-then-soft, used for the celebratory pops.
const POP: [number, number, number, number] = [0.2, 0.9, 0.2, 1];

// Memoised so unrelated parent re-renders (e.g. the once-a-second clock tick in
// TodoView) can't re-pass fresh keyframe arrays mid-burst and restart the pop.
const StarIcon = React.memo(({ active, burst }: { active: boolean; burst: boolean }) => (
  <div className="relative">
    <motion.div
      animate={burst ? { scale: [0.5, 1.4, 1], rotate: [-20, 12, 0] } : { scale: 1, rotate: 0 }}
      transition={{ duration: 0.45, ease: POP }}
      style={{
        color: active ? GOLD : 'rgba(255,255,255,0.18)',
        filter: active ? `drop-shadow(0 0 5px ${GOLD}cc)` : 'none'
      }}
    >
      <Astroid size={28} strokeWidth={2.5} fill={active ? GOLD : 'transparent'} />
    </motion.div>
    <AnimatePresence>{burst && <ParticleBurst />}</AnimatePresence>
  </div>
));
StarIcon.displayName = 'StarIcon';

const StarStreakBase: React.FC<StarStreakProps> = ({ dayTodos, date }) => {
  const { stars, streak } = useMemo(() => computeStarStreak(dayTodos, date), [dayTodos, date]);

  // Fire animations only on a genuine increase — never on first mount or when
  // the viewed date changes (navigating between days shouldn't celebrate).
  const prevStars = useRef(stars);
  const prevStreak = useRef(streak);
  const prevDate = useRef(date);
  const [bursting, setBursting] = useState<number[]>([]);
  const [streakPulse, setStreakPulse] = useState(0);

  useEffect(() => {
    if (prevDate.current !== date) {
      prevDate.current = date;
      prevStars.current = stars;
      prevStreak.current = streak;
      return;
    }
    if (stars > prevStars.current) {
      const newly: number[] = [];
      for (let i = prevStars.current; i < stars; i++) newly.push(i);
      setBursting(b => [...b, ...newly]);
      newly.forEach(i =>
        setTimeout(() => setBursting(b => b.filter(x => x !== i)), 750)
      );
    }
    if (streak > prevStreak.current) {
      setStreakPulse(p => p + 1);
    }
    prevStars.current = stars;
    prevStreak.current = streak;
  }, [stars, streak, date]);

  const pulsing = streakPulse > 0;
  useEffect(() => {
    if (!pulsing) return;
    const t = setTimeout(() => setStreakPulse(0), 900);
    return () => clearTimeout(t);
  }, [streakPulse, pulsing]);

  // At 3★ the streak badge inverts: solid gold fill with black digits.
  const maxed = stars >= 3;

  return (
    <div className="fixed right-4 bottom-5 z-30 pointer-events-none select-none font-mono">
      {/* pr matches py so the badge has equal gap to the right edge as top/bottom. */}
      <div
        className="relative flex items-center gap-2.5 rounded-lg pl-5 pr-2 py-2"
        // style={{ borderColor: GOLD, backgroundColor: 'rgba(20,16,8,0.85)' }}
      >
        <div className="flex items-center gap-2">
          {[0, 1, 2].map(i => (
            <StarIcon key={i} active={i < stars} burst={bursting.includes(i)} />
          ))}
        </div>

        {/* Streak badge */}
        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {/* {pulsing && (
              <motion.span
                key={streakPulse}
                className="absolute rounded-full border-2"
                style={{ borderColor: GOLD }}
                initial={{ width: 44, height: 44, opacity: 0.85 }}
                animate={{ width: 78, height: 78, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )} */}
          </AnimatePresence>
          <motion.div
            className="relative flex items-center justify-center min-w-10 h-10 rounded-full px-3"
            animate={{
              backgroundColor: maxed ? GOLD : 'rgba(255,194,75,0.14)',
              scale: pulsing ? [1, 1.22, 0.97, 1] : 1
            }}
            transition={{
              backgroundColor: { duration: 0.4 },
              scale: { duration: 0.45, ease: POP }
            }}
          >
            <motion.span
              key={streak}
              className="text-xl font-bold leading-none"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, color: maxed ? '#000000' : GOLD }}
              transition={{ scale: { duration: 0.45, ease: POP }, color: { duration: 0.4 } }}
            >
              {streak}
            </motion.span>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// dayTodos / date are stable between edits, so memoising keeps the widget from
// re-rendering on TodoView's per-second clock tick — the source of the flutter.
export const StarStreak = React.memo(StarStreakBase);

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StarStreak, STAR_BLOOM_MS } from '@/features/xp/StarStreak';
import { overlayBackdrop } from '@/common/ui/modalMotion';
import { ImpactShake } from '@/common/ui';

interface StarStreakPopupProps {
  // Live goal flags + streak (DailyScreen computes them). The popup SNAPSHOTS these
  // the instant a star is earned and animates purely from that frozen snapshot, so
  // later task edits - e.g. unchecking a task mid-celebration - can never disturb an
  // in-flight popup. This is the whole point of the decoupling.
  lit: boolean[];
  streak: number;
  date: string;
}

// Timing (ms).
const XP_MS = 900;       // wait out the XP count-up before the popup appears
// Gap between the popup appearing and the stars lighting up. This IS the bloom's
// charge window - the star stays dark while gold light gathers behind it - so it
// tracks STAR_BLOOM_MS rather than being tuned independently.
const BURST_LEAD = STAR_BLOOM_MS;
const VISIBLE_MS = 2000; // how long the popup stays up (measured from when it appears)

// The corner widget (DailyScreen) lags its data by this much so it reflects the new
// total right as the popup lights up - "the pop plays, then the corner catches up".
export const STAR_CELEBRATE_DELAY_MS = XP_MS + BURST_LEAD;

interface Snapshot {
  lit: boolean[];       // the earned flag state
  burst: boolean[];     // which slots newly lit (the ones to pop)
  streak: number;       // earned streak
  prevStreak: number;   // streak just before, so the badge can tick up
}

const starCount = (lit: boolean[]) => lit.filter(Boolean).length;

// A centered, transient celebration shown when a new star is earned. It renders the
// presentational StarStreak from a frozen snapshot and drives the burst via explicit
// timers - no dependency on task state after the trigger.
const StarStreakPopupBase: React.FC<StarStreakPopupProps> = ({ lit, streak, date }) => {
  const prevLit = useRef(lit);
  const prevStreak = useRef(streak);
  const prevDate = useRef(date);
  const timers = useRef<number[]>([]);

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [show, setShow] = useState(false);
  // false = mounted at the pre-earn look (newly-lit stars still dark); true = lit +
  // bursting. The timeline flips this so it reads "popup appears, THEN stars burst".
  const [reveal, setReveal] = useState(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    // Navigating between days isn't an achievement - resync without celebrating.
    if (prevDate.current !== date) {
      prevDate.current = date;
      prevLit.current = lit;
      prevStreak.current = streak;
      return;
    }
    if (starCount(lit) > starCount(prevLit.current)) {
      const snapshot: Snapshot = {
        lit: [...lit],
        burst: lit.map((on, i) => on && !prevLit.current[i]),
        streak,
        prevStreak: prevStreak.current,
      };
      // A fresh earn supersedes any still-running celebration.
      clearTimers();
      setReveal(false);
      timers.current.push(
        window.setTimeout(() => { setSnap(snapshot); setShow(true); }, XP_MS),
        window.setTimeout(() => setReveal(true), XP_MS + BURST_LEAD),
        window.setTimeout(() => setShow(false), XP_MS + VISIBLE_MS),
      );
    }
    prevLit.current = lit;
    prevStreak.current = streak;
  }, [lit, streak, date]);

  return (
    <AnimatePresence>
      {show && snap && (
        <motion.div
          className={`fixed inset-0 z-[60] flex items-center justify-center pointer-events-none ${overlayBackdrop} scale-150`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => null}
        >
          {/* `reveal` fires the shake on the same tick as the star pop and the
              particle burst, so the hit reads as one event. */}
          <ImpactShake active={reveal}>
            <StarStreak
              pinned={false}
              lit={reveal ? snap.lit : snap.lit.map((on, i) => on && !snap.burst[i])}
              bursting={reveal ? snap.burst : undefined}
              // NOT gated on reveal: the bloom starts charging the moment the
              // popup mounts and is still mounted when the burst lands, which is
              // what lets it hand off mid-charge instead of restarting.
              blooming={snap.burst}
              streak={reveal ? snap.streak : snap.prevStreak}
              streakPulse={reveal && snap.streak > snap.prevStreak}
            />
          </ImpactShake>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const StarStreakPopup = React.memo(StarStreakPopupBase);

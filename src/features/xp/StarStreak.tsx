import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Astroid } from 'lucide-react';
import { useThemeColor } from '@/theme/useThemeColor';
import { ParticleBurst } from '@/common/ui';

interface StarStreakProps {
  // The three goal flags in slot order: completed a task, beat yesterday, beat the
  // average. Callers compute these (see computeStarStreak) - this component doesn't.
  lit: boolean[];
  streak: number;
  // Per-slot burst + streak pulse. Driven ONLY by the celebration popup; the pinned
  // corner instance omits them and so renders statically (no animation, just state).
  bursting?: boolean[];
  // Per-slot lead-up bloom: gold light gathering into the star before it pops.
  // Pass the slots that are ABOUT to burst and leave it set through the burst -
  // the bloom hands off to its own blow-out (see StarIcon).
  blooming?: boolean[];
  streakPulse?: boolean;
  // True (default) pins to the bottom-right corner; false renders in-flow so the
  // popup can center it.
  pinned?: boolean;
}

// Snappy-then-soft, used for the celebratory pops.
const POP: [number, number, number, number] = [0.2, 0.9, 0.2, 1];

// How long the bloom takes to charge. Exported because the popup has to hold the
// star dark for exactly this long before revealing it - see STAR_BLOOM_MS use in
// StarStreakPopup.
export const STAR_BLOOM_MS = 600;

// Memoised so unrelated parent re-renders can't re-pass fresh keyframe arrays
// mid-burst and restart the pop.
const StarIcon = React.memo(
  ({ active, burst, bloom, gold }: { active: boolean; burst: boolean; bloom: boolean; gold: string }) => (
    <div className="relative">
      {/* Lead-up bloom: a blurred gold copy of the star sitting behind the real
          one, so the light that gathers is star-shaped rather than a blob. It
          mounts once and stays mounted through the burst - motion animates from
          wherever the charge got to, so the hand-off to the blow-out is seamless
          however early the burst lands. Blur radius is fixed and intensity rides
          on opacity/scale; animating blur() per frame costs far more and looks
          the same. */}
      {(bloom || burst) && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center blur-xs"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={burst ? { opacity: 0, scale: 1.5 } : { opacity: 0.9, scale: 1 }}
          transition={
            burst
              ? { duration: 1.1, ease: 'easeOut' }
              : { duration: STAR_BLOOM_MS / 1000, ease: 'easeIn' }
          }
        >
          <Astroid size={30} strokeWidth={2.5} fill={gold} color={gold} />
        </motion.div>
      )}
      <motion.div
        animate={burst ? { scale: [1, 1.4, 0.8, 1], rotate: [-20, 12, 0] } : { scale: 1, rotate: 0 }}
        transition={{ duration: 1.1, ease: POP }}
        className={active ? 'text-xp-tier1 drop-shadow-[0_0_6px] drop-shadow-xp-tier1' : 'text-fg-faint/25'}
      >
        <Astroid size={30} strokeWidth={2.5} fill={active ? gold : 'transparent'} />
      </motion.div>
      <AnimatePresence>{burst && <ParticleBurst />}</AnimatePresence>
    </div>
  )
);
StarIcon.displayName = 'StarIcon';

// Pure presentational star/streak readout. Task calculation (which flags are lit, the
// streak count) lives in DailyScreen; animation orchestration lives in StarStreakPopup.
// This component only renders what it's told, so the corner instance reflects state
// with zero animation while the popup instance plays the full celebration.
const StarStreakBase: React.FC<StarStreakProps> = ({
  lit,
  streak,
  bursting,
  blooming,
  streakPulse = false,
  pinned = true,
}) => {
  const GOLD = useThemeColor('xp-tier1');
  const GOLD_BG = useThemeColor('warning-tint');
  const GOLD_TEXT = useThemeColor('warning');

  // At 3★ the streak badge inverts: solid gold fill with black digits.
  const maxed = lit.filter(Boolean).length >= 3;

  return (
    <div className={`${pinned ? 'fixed right-4 bottom-5 z-30' : ''} pointer-events-none select-none font-mono`}>
      {/* pr matches py so the badge has equal gap to the right edge as top/bottom. */}
      <div className="relative flex items-center gap-2.5 rounded-lg pl-5 pr-2 py-2">
        <div className="flex items-center gap-2">
          {lit.map((active, i) => (
            <StarIcon
              key={i}
              active={active}
              burst={bursting?.[i] ?? false}
              bloom={blooming?.[i] ?? false}
              gold={GOLD}
            />
          ))}
        </div>

        {/* Streak badge */}
        <div className="relative flex items-center justify-center">
          <motion.div
            className="relative flex items-center justify-center min-w-12 h-13 rounded-full pl-4 pr-1.5"
            animate={{
              backgroundColor: maxed ? GOLD : GOLD_BG,
              scale: streakPulse ? [1, 1.1, 0.9, 1] : 1,
            }}
            transition={{
              backgroundColor: { duration: 0.4 },
              scale: { duration: 1.1, ease: POP }
            }}
          >
            <motion.span
              key={streak}
              className="text-2xl font-bold leading-none"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              animate={{ color: maxed ? '#000000' : ["white", GOLD_TEXT], scale: maxed ? [1, 1.25, 1] : 1}}
              transition={{ scale: { duration: 0.6, ease: POP }, color: { duration: 0.4 } }}
            >
              {streak}🔥
            </motion.span>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export const StarStreak = React.memo(StarStreakBase);

import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { XpStats } from '../utils/xpUtils';

interface XpProgressBarProps {
  stats: XpStats;
  /** Earned XP for the last 4 sliding weeks, oldest first (last = current week). */
  weeklyXp: number[];
}

const GOLD = '#ffc24b';
const VIOLET = '#a78bfa';

// Exponential ease-out: snappy start, soft landing.
const EXPO_OUT: [number, number, number, number] = [0.15, 0, 0, 1];

export const XpProgressBar: React.FC<XpProgressBarProps> = ({ stats, weeklyXp }) => {
  const {
    earned,
    target,
    upForGrabs,
    yesterday,
    bestLast7Days,
    avgLast7Days,
    bestAllTime,
    percent,
    remaining,
    reachedTarget,
    reachedWeekBest,
    reachedAllTimeBest
  } = stats;

  // Tiered, progressive goals: beat yesterday → beat the 7-day best → beat the
  // all-time best. The "lit" colour tracks how far you've climbed.
  const lit = reachedWeekBest ? VIOLET : reachedTarget ? GOLD : null;

  let status: string;
  if (!reachedTarget) {
    status = target === 0 ? 'Any XP beats yesterday' : `${remaining} XP to beat yesterday`;
  } else if (!reachedWeekBest) {
    // Yesterday cleared (gold). Point at the next goal: the 7-day best.
    status = `Ahead of yesterday ⬩ ${bestLast7Days - earned} XP to 7-day best`;
  } else if (!reachedAllTimeBest) {
    // 7-day best cleared (violet). Point at the all-time best.
    status = `${bestAllTime - earned} XP to beat all-time best`;
  } else {
    const over = earned - bestAllTime;
    status = over > 0 ? `New all-time best ⬩ +${over} XP` : 'All-time best matched';
  }

  const pctLabel = `${Math.round(percent)}%`;
  const barColor = reachedWeekBest ? VIOLET : "#ff723a"; //#ff774d coral maybe

  // Count-up: smoothly tick the displayed number toward the real earned total.
  const count = useMotionValue(earned);
  const display = useTransform(count, v => Math.round(v));
  useEffect(() => {
    const controls = animate(count, earned, { duration: 1.0, ease: EXPO_OUT });
    return () => controls.stop();
  }, [count, earned]);

  return (
    <>
      {/* ── Bottom-left: XP info ─────────────────────────────────────────── */}
      <div className="fixed left-18 bottom-7 z-30 select-none pointer-events-none font-mono">
        {/* The whole text block glows in the goal colour once a target is hit —
            a text-shadow on the text itself, no background and no box-shadow. */}
        <div
          className="relative flex items-end gap-3.5 transition-all duration-300"
          style={{
            textShadow: lit ? `0 0 18px ${lit}66, 0 0 6px ${lit}40` : 'none'
          }}
        >
          <div className="relative flex items-baseline gap-1.5 leading-none">
            <motion.span
              animate={{ color: lit ?? '#ffffff' }}
              transition={{ duration: 0.3, ease: EXPO_OUT }}
              className="text-7xl font-medium"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {display}
            </motion.span>
          </div>

          <div className="relative flex flex-col gap-1 pb-2">
            {/* Status — the header. Accent by default; lights up gold, then violet. */}
            <span
              className="text-sm font-medium leading-tight tracking-wide transition-colors duration-300"
              style={{ color: lit ?? 'var(--accent1)' }}
            >
              {status}
            </span>

            {/* Today: still available ⬩ yesterday */}
            <span className="text-[12px] font-medium leading-tight">
              <span className='text-white/85'>
              <span className="">{upForGrabs}</span> up for grabs ⬩ 
              <span className=""> {yesterday}</span> yesterday</span>
              {/* <span className="text-white/95">{upForGrabs}</span>
              <span className="text-white/60"> up for grabs</span>
              <span className="text-white/30"> ⬩ </span>
              <span className="text-white/95">{yesterday}</span>
              <span className="text-white/60"> yesterday</span> */}
            </span>

            {/* Records: avg 7d ⬩ best 7d ⬩ best all time */}
            <span className="text-[12px] leading-tight">
              <span className='text-white/70'>
              <span className=""> {avgLast7Days} </span> avg 7d ⬩
              <span className=""> {bestLast7Days} </span> best 7d ⬩
              <span className=""> {bestAllTime} </span> best all-time
              </span>
            </span>
          </div>

          {/* Last-4-weeks mini bars — a static, at-a-glance progress indicator.
              Native title tooltip needs hover, so re-enable pointer events here. */}
          <div className="flex items-end gap-1.5 h-14 pb-2 ml-2 pointer-events-auto">
            {(() => {
              const max = Math.max(...weeklyXp, 1);
              const MAX_H = 52;
              const MIN_H = 5;
              const barColor = lit ?? 'var(--accent1)';
              return weeklyXp.map((xp, i) => {
                const weeksAgo = weeklyXp.length - 1 - i;
                const label =
                  weeksAgo === 0 ? 'This week' : `${weeksAgo} week${weeksAgo > 1 ? 's' : ''} ago`;
                // A 0-XP week gets no bar at all, so it never reads as progress.
                const height = xp === 0 ? 0 : Math.max(MIN_H, Math.round((xp / max) * MAX_H));
                return (
                  <div
                    key={i}
                    title={`${label}: ${xp} XP`}
                    className="w-3"
                    style={{ height, backgroundColor: barColor }}
                  />
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* ── Bottom: full-width progress bar ──────────────────────────────── */}
      {/* Starts at the ribbon's right edge (w-14) so it spans the true content
          width; the centered % label then sits on the content area's centre. */}
      <div className="fixed bottom-0 left-14 right-0 z-30 pointer-events-none">
        <div className="relative flex justify-center mb-1">
          <span
            className="text-[12px] tracking-wide text-white/60 font-mono"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {pctLabel}
          </span>
        </div>

        <div className="relative h-2 w-full bg-white/10">
          {/* Soft blurred glow that follows the fill */}
          <motion.div
            className="absolute inset-y-0 left-0 blur-lg opacity-90"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%`, backgroundColor: barColor }}
            transition={{ duration: 0.6, ease: EXPO_OUT }}
          />
          {/* Crisp solid fill on top */}
          <motion.div
            className="absolute inset-y-0 left-0"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%`, backgroundColor: barColor }}
            transition={{ duration: 0.6, ease: EXPO_OUT }}
          />
        </div>
      </div>
    </>
  );
};

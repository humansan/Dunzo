import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { XpStats } from '@/features/xp/model/xp';
import { useThemeColor } from '@/theme/useThemeColor';
import { EXPO_OUT } from '@/common/ui/motion';

interface XpProgressBarProps {
  stats: XpStats;
  /** Earned XP for the last 4 sliding weeks, oldest first (last = current week). */
  weeklyXp: number[];
}


export const XpProgressBar: React.FC<XpProgressBarProps> = ({ stats, weeklyXp }) => {
  // XP indicator keeps its fixed signature colors across all themes (gold → purple,
  // coral bar). Only the base "not yet lit" text follows the theme so it stays legible
  // in light mode.
  const GOLD = useThemeColor('xp-tier1');
  const VIOLET = useThemeColor('xp-tier2');
  const CORAL = useThemeColor('xp-bar');
  const FG = useThemeColor('fg');
  const {
    earned,
    target,
    upForGrabs,
    yesterday,
    bestLast7Days,
    avgLast7Days,
    avgLast30Days,
    bestAllTime,
    percent,
    remaining,
    reachedTarget,
    reachedWeekBest,
    reachedAllTimeBest
  } = stats;

  // The third star is measured against the higher of the two averages, so show
  // the one that's actually the bar to clear. Ties fall to the 7-day figure.
  const avgIs30 = avgLast30Days > avgLast7Days;
  const avgValue = avgIs30 ? avgLast30Days : avgLast7Days;
  const avgLabel = avgIs30 ? 'avg 30d' : 'avg 7d';

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
  const barColor = reachedWeekBest ? VIOLET : CORAL;

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
            textShadow: lit
              ? `0 0 18px color-mix(in srgb, ${lit} 40%, transparent), 0 0 6px color-mix(in srgb, ${lit} 25%, transparent)`
              : 'none'
          }}
        >
          <div className="relative flex items-baseline gap-1.5 leading-none">
            <motion.span
              animate={{ color: lit ?? FG }}
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
              <span className='text-fg'>
              <span className="">{upForGrabs}</span> up for grabs ⬩ 
              <span className=""> {yesterday}</span> yesterday</span>
              {/* <span className="text-fg">{upForGrabs}</span>
              <span className="text-fg-subtle"> up for grabs</span>
              <span className="text-fg-ghost"> ⬩ </span>
              <span className="text-fg">{yesterday}</span>
              <span className="text-fg-subtle"> yesterday</span> */}
            </span>

            {/* Records: avg 7d ⬩ best 7d ⬩ best all time */}
            <span className="text-[12px] leading-tight">
              <span className='text-fg-muted'>
              <span className=""> {avgValue} </span> {avgLabel} ⬩
              <span className=""> {bestLast7Days} </span> best 7d ⬩
              <span className=""> {bestAllTime} </span> best all-time
              </span>
            </span>
          </div>

          {/* Last-4-weeks mini bars — a static, at-a-glance progress indicator.
              Native title tooltip needs hover, so re-enable pointer events here. */}
          {/* <div className="flex items-end gap-1.5 h-14 pb-2 ml-2 pointer-events-auto">
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
          </div> */}
        </div>
      </div>

      {/* ── Bottom: full-width progress bar ──────────────────────────────── */}
      {/* Starts at the ribbon's right edge (w-14) so it spans the true content
          width; the centered % label then sits on the content area's centre. */}
      <div className="fixed bottom-0 left-14 right-0 z-30 pointer-events-none">
        <div className="relative flex justify-center mb-1">
          <span
            className="text-[12px] tracking-wide text-fg-subtle font-mono"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {pctLabel}
          </span>
        </div>

        <div className="relative h-2 w-full bg-fill">
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

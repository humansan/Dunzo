import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { jitterKeyframes } from './motion';

interface ImpactShakeProps {
  // Flip to true to fire a shake. Flipping it back to false resets to rest.
  active: boolean;
  duration?: number;
  amplitude?: number;
  steps?: number;
  decay?: number;
  children: React.ReactNode;
}

// Wraps children in a one-shot random shake, for punctuating an impact.
//
// Keep this OUTSIDE anything that animates its own transform - two transforms on
// one element fight. Also avoid wrapping a backdrop-blur layer: transforming it
// is expensive, and shaking the dim along with the content looks wrong.
export const ImpactShake: React.FC<ImpactShakeProps> = React.memo(
  ({ active, duration = 0.25, amplitude, steps, decay, children }) => {
    // Fresh randomness per fire, but pinned for the duration of that fire: a
    // parent re-render mid-shake must not reshuffle the keyframes and restart it.
    const frames = useMemo(
      () => (active ? jitterKeyframes({ amplitude, steps, decay }) : null),
      [active, amplitude, steps, decay]
    );

    return (
      <motion.div
        style={{ willChange: active ? 'transform' : undefined }}
        animate={frames ? { x: frames.x, y: frames.y, rotate: frames.rotate } : { x: 0, y: 0, rotate: 0 }}
        // linear: each step should land as a hard jolt. Easing between random
        // offsets smooths the jitter back into a wobble.
        transition={frames ? { duration, times: frames.times, ease: (p) => Math.floor(p * 1) / 1 } : { duration: 0 }}
      >
        {children}
      </motion.div>
    );
  }
);
ImpactShake.displayName = 'ImpactShake';

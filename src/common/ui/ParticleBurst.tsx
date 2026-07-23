import React, { useMemo } from 'react';
import { motion } from 'motion/react';

const GOLD = '#ffc24b';
// A deliberately varied palette so a burst feels colourful, not flat.
const PARTICLE_COLORS = ['#ffc24b', '#ff8a3d', '#ff5d8f', '#a78bfa', '#7dd3fc', '#ffffff'];

// ── A short colourful particle burst + ring, centred on its container ──
// Absolutely positioned, so drop it inside a `relative` parent and mount it via
// AnimatePresence.
export const ParticleBurst: React.FC = React.memo(() => {
  const parts = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 14 + Math.random() * 16;
        return {
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist,
          c: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          s: 3 + Math.random() * 2.5
        };
      }),
    []
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <motion.span
        className="absolute rounded-full border-2"
        style={{ borderColor: GOLD }}
        initial={{ width: 6, height: 6, opacity: 0.9 }}
        animate={{ width: 42, height: 42, opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, backgroundColor: p.c, boxShadow: `0 0 6px ${p.c}` }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
});
ParticleBurst.displayName = 'ParticleBurst';

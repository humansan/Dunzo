import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useThemeColor } from '@/theme/useThemeColor';


// A deliberately varied palette so a burst feels colourful, not flat.
const PARTICLE_COLORS = ['#ffb82b', '#ff7d27', '#ff5d8f', '#9876ff', '#31beff', '#84ff6e'];

// ── A short colourful particle burst + ring, centred on its container ──
// Absolutely positioned, so drop it inside a `relative` parent and mount it via
// AnimatePresence.
export const ParticleBurst: React.FC = React.memo(() => {
  const GOLD = useThemeColor('xp-tier1');
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
        initial={{ width: 24, height: 24, opacity: 1 }}
        animate={{ width: 48, height: 48, opacity: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full scale-180"
          style={{ width: p.s, height: p.s, backgroundColor: p.c, boxShadow: `0 0 6px ${p.c}` }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
});
ParticleBurst.displayName = 'ParticleBurst';

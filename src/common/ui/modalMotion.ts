import type { Transition } from 'motion/react';

// Shared pop-in for center-screen modals. A pure center-origin scale (no y
// offset, which made the zoom look like it grew from the bottom) with a tight
// scale range and a quick ease so it feels snappy. Spread onto the panel
// motion.div: <motion.div {...modalPop} />.
export const modalPop = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.13, ease: 'easeOut' } as Transition,
};

// Shared dim + blur backdrop appearance for overlay windows (settings, task full
// view, ⌘K search, tracker form, collection modals) so they all look the same.
// Compose with per-overlay positioning, e.g.:
//   className={`fixed inset-0 flex items-center justify-center ${overlayBackdrop}`}
export const overlayBackdrop = `bg-canvas/50 backdrop-blur-lg`;

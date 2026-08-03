import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { useDismissable } from '@/common/ui/useDismissable';

// The standard popup window: portalled backdrop + centered panel, with the
// shared dismissal behavior from useDismissable (Escape, backdrop click, scroll
// lock). Callers render only the panel's contents.
//
// Overlays whose own markup is the panel (task full view, settings) skip this and
// call useDismissable directly - the behavior is the same either way, this just
// also owns the chrome around it.

// Named tiers instead of z-index literals sprinkled across features, so a dialog
// opened *from* another overlay reliably lands above it.
const LAYER = {
  base: 'z-[70]', //   a window opened from the page
  nested: 'z-[80]', // a dialog opened from a window (e.g. confirm over full view)
  command: 'z-[100]', // ⌘K finder - above everything
} as const;

export const OverlayShell: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  layer?: keyof typeof LAYER;
  /** Center the panel (default) or hang it below the top edge, ⌘K-style. */
  align?: 'center' | 'top';
  /** Extra classes for the backdrop, e.g. custom padding. */
  className?: string;
  /** Classes for the panel - sizing, background, border, radius. */
  panelClassName?: string;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
}> = ({
  onClose,
  children,
  layer = 'base',
  align = 'center',
  className = 'p-4',
  panelClassName = '',
  closeOnEsc = true,
  closeOnBackdrop = true,
}) => {
  const { backdropProps } = useDismissable({ onDismiss: onClose, closeOnEsc, closeOnBackdrop });

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      {...backdropProps}
      className={`fixed inset-0 ${LAYER[layer]} flex justify-center ${
        align === 'center' ? 'items-center' : 'items-start'
      } ${className} ${overlayBackdrop}`}
    >
      <motion.div {...modalPop} className={panelClassName}>
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
};

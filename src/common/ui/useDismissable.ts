import { useCallback, useEffect, useId, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import {
  isTopOverlay,
  lockBodyScroll,
  pushOverlay,
  removeOverlay,
  unlockBodyScroll,
} from '@/common/ui/overlayStack';

// One definition of "how an overlay is dismissed", shared by every popup window
// in the app (task full view, settings, ⌘K finder, tracker form, confirm and
// collection dialogs) so they behave the same:
//
//   - Escape closes it, but only the topmost one (see overlayStack).
//   - Clicking the backdrop closes it, but only when the press *and* the release
//     both land on the backdrop. Closing on mousedown alone fires before the user
//     can drag back onto the panel; closing on click alone means selecting text
//     in the panel and releasing outside it dismisses the window.
//   - The page behind it doesn't scroll while it's open.
//
// Overlays with their own panel markup use this hook directly; the simpler ones
// get it through <OverlayShell/>, which also owns the backdrop element.
export function useDismissable({
  onDismiss,
  closeOnEsc = true,
  closeOnBackdrop = true,
  lockScroll = true,
  active = true,
}: {
  onDismiss: () => void;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
  lockScroll?: boolean;
  /** False while the overlay is mounted but not shown (e.g. an `isOpen` modal). */
  active?: boolean;
}) {
  // Identity for this overlay's slot in the stack. useId is stable across the
  // component's lifetime, and the symbol keeps the registry from colliding with
  // anything else.
  const key = useId();
  const id = useMemo(() => Symbol(key), [key]);

  useEffect(() => {
    if (!active) return;
    pushOverlay(id);
    return () => removeOverlay(id);
  }, [id, active]);

  useEffect(() => {
    if (!active || !lockScroll) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active, lockScroll]);

  useEffect(() => {
    if (!active || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      // While an IME candidate window is up, Escape cancels the composition;
      // closing the overlay on the same key would be a surprise.
      if (e.key !== 'Escape' || e.isComposing) return;
      if (!isTopOverlay(id)) return;
      onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, active, closeOnEsc, onDismiss]);

  // Press and release must both hit the backdrop itself (`target === currentTarget`
  // - anything inside the panel bubbles up with a deeper target).
  const pressedBackdrop = useRef(false);
  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    pressedBackdrop.current = e.target === e.currentTarget;
  }, []);
  const onMouseUp = useCallback(
    (e: ReactMouseEvent) => {
      const hit = pressedBackdrop.current && e.target === e.currentTarget;
      pressedBackdrop.current = false;
      if (hit && closeOnBackdrop) onDismiss();
    },
    [closeOnBackdrop, onDismiss]
  );

  /** Spread onto the backdrop element (the full-screen one behind the panel). */
  const backdropProps = useMemo(() => ({ onMouseDown, onMouseUp }), [onMouseDown, onMouseUp]);

  return { backdropProps };
}

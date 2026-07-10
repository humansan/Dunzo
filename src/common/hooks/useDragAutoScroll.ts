import { useCallback, useEffect, useRef } from 'react';

// Auto-scroll a container vertically while an HTML5 drag hovers near its top or
// bottom edge. Speed ramps up the closer the cursor is to the edge.
//
// The returned `onDragOver`/`onDragEnter` also call preventDefault, which makes
// the whole container a valid drop zone — this is what stops the cursor from
// flickering to the "no-drop" (circle-slash) icon when crossing row boundaries
// or hovering gaps between rows. Call `stop()` on drop/dragend.
export function useDragAutoScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(0);

  const tick = useCallback(() => {
    const el = ref.current;
    if (el && speedRef.current !== 0) {
      el.scrollTop += speedRef.current;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const EDGE = 64; // px from an edge where scrolling starts
    const MAX = 18;  // px per frame at the very edge
    const y = e.clientY;
    let speed = 0;
    if (y < rect.top + EDGE) {
      speed = -MAX * Math.min(1, (rect.top + EDGE - y) / EDGE);
    } else if (y > rect.bottom - EDGE) {
      speed = MAX * Math.min(1, (y - (rect.bottom - EDGE)) / EDGE);
    }
    speedRef.current = speed;
    if (speed !== 0 && rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const onDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const stop = useCallback(() => {
    speedRef.current = 0;
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // Cancel any pending frame on unmount.
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { ref, onDragOver, onDragEnter, stop };
}

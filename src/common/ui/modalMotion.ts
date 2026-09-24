// Shared enter animations for center-screen overlay windows (settings, task full
// view, ⌘K search, tracker form, collection modals).
//
// These are CSS keyframes (src/index.css), not motion props, on purpose: motion's
// WAAPI animations cancel themselves on finish a frame before the final style is
// written, so every window blinked back to `initial` (invisible) right after
// popping in. CSS animations hold their end state natively. The trade-off is no
// exit animation - overlays close instantly, which most already did since they
// unmount without an AnimatePresence around them.

// Panel pop-in: a center-origin scale (no y offset, which made the zoom look like
// it grew from the bottom) with a tight range and a quick ease so it feels snappy.
//   <div className={`${modalPop} ...`} />
export const modalPop = 'animate-modal-pop';

// Shared dim + blur backdrop appearance, so every overlay looks the same. Compose
// with per-overlay positioning, e.g.:
//   className={`fixed inset-0 flex items-center justify-center ${overlayBackdrop} ${overlayFadeIn}`}
export const overlayBackdrop = `bg-canvas/50 backdrop-blur-lg`;

// Backdrop fade-in. Separate from overlayBackdrop because StarStreakPopup reuses
// the look but runs its own motion fade (a CSS animation would override it).
export const overlayFadeIn = 'animate-overlay-in';

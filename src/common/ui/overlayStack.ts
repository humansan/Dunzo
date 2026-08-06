// Module-level registry of the overlays that are currently open, in the order
// they opened. Two things need a single global view of that:
//
//   - Escape. Every overlay listens on `window` (so a keypress anywhere closes
//     it, not just one inside the panel), which means a confirm dialog opened
//     from inside the task full view would otherwise dismiss both at once. Only
//     the last-registered overlay answers the key.
//   - Scroll lock. The page behind must not scroll while anything is open, but
//     the lock is refcounted: a nested overlay closing must not unlock while its
//     parent is still up.
//
// Not a React context on purpose - overlays mount in unrelated trees (some
// portalled to <body>), and ordering here is mount order, which is exactly the
// stacking order we want.

type OverlayId = symbol;

let stack: OverlayId[] = [];

export const pushOverlay = (id: OverlayId) => {
  stack.push(id);
};

export const removeOverlay = (id: OverlayId) => {
  stack = stack.filter((x) => x !== id);
};

/** True for the most recently opened overlay - the one Escape belongs to. */
export const isTopOverlay = (id: OverlayId) => stack[stack.length - 1] === id;

// ── Body scroll lock ─────────────────────────────────────────────────────────
// Refcounted so nested overlays compose. Hiding the scrollbar reflows the page
// underneath, so its width is added back as padding to keep the layout still.

let lockCount = 0;
let restore: { overflow: string; paddingRight: string } | null = null;

export const lockBodyScroll = () => {
  if (lockCount++ > 0) return;
  const body = document.body;
  restore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
};

export const unlockBodyScroll = () => {
  if (--lockCount > 0) return;
  lockCount = 0;
  if (!restore) return;
  document.body.style.overflow = restore.overflow;
  document.body.style.paddingRight = restore.paddingRight;
  restore = null;
};

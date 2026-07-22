// Style recipes for the focus surface.
//
// This is the one place in the app that deliberately does NOT use the role tokens
// in @/theme - those resolve against the app canvas, and this UI sits on top of a
// user-supplied photo. White-on-image with alpha fills is the only thing that
// stays legible over an arbitrary background, in either theme.
//
// Same intent as theme/buttons.ts, scoped to this surface: define each behavior
// once so the widget and the fullscreen view can't drift apart. They previously
// retyped these strings at every call site, which is how they drifted in the first
// place (the widget's Reset button used bg-white/10, the fullscreen one bg-white/15).

export type FocusSize = 'sm' | 'lg';

const press = 'active:bg-white/10 active:scale-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';

// The labelled action (Start / Pause / Resume).
export const focusPrimary = (size: FocusSize): string =>
  `flex items-center justify-center gap-2 rounded-full bg-white/20 text-white font-semibold ${press} ` +
  (size === 'lg' ? 'min-w-32 px-4 py-2.5 text-base' : 'min-w-25 px-3 py-2 text-sm');

// Round icon button sitting beside it (Reset / Skip).
export const focusIcon = (size: FocusSize): string =>
  `flex items-center justify-center rounded-full bg-white/15 text-white ${press} ` +
  (size === 'lg' ? 'w-11 h-11' : 'w-9 h-9');

// Same weight as focusIcon but wide enough for a short label ("+5").
export const focusIconWide = (size: FocusSize): string =>
  `flex items-center justify-center gap-1 rounded-full bg-white/15 text-white font-semibold ${press} ` +
  (size === 'lg' ? 'h-11 px-4 text-sm' : 'h-9 px-3 text-xs');

// Header affordances in the fullscreen view (image / brightness / config / close).
export const focusHeaderBtn =
  'w-11 h-11 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer';

// Floating popover (background settings, focus config).
export const focusPanel =
  'rounded-2xl bg-black/45 backdrop-blur-md shadow-2xl text-white';

// Segmented-control segment, and the preset chips in the duration picker.
export const focusSegment = (active: boolean, size: FocusSize): string =>
  `rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed ` +
  (size === 'lg' ? 'px-4 py-1.5 text-sm ' : 'px-2.5 py-1 text-xs ') +
  (active ? 'bg-white/25 text-white font-semibold' : 'text-white/60 hover:text-white hover:bg-white/10');

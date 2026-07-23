// Shared button style recipes — the 4 canonical button behaviors, defined ONCE so buttons
// stop drifting. Mirrors pill.ts. Each returns Tailwind CLASS strings for the color / hover
// / active / disabled *behavior* only; the caller adds layout+size (padding, height,
// radius, icon gap, flex centering) since those legitimately vary by context (a 36px icon
// square vs a full-width CTA). Change a button class app-wide by editing this file.
//
//   1. ghost   — no background until hover; toggled/open = filled.   btnGhost(active?)
//                (icon buttons: card options/close, planner Sections/Fields/Filter/Sort/
//                 Tabs, collections pane)
//   2. neutral — gray fill, hover brightens, stays neutral.          btnNeutral
//                (daily-list + calendar + trackers nav rows: Today, prev/next, …)
//   3. toggle  — neutral by default, active = accent fill.           btnToggle(active?, accent?)
//                (sidebar ribbon tabs, daily-list week days, tracker edit widget)
//   4. accent  — always an accent fill. Primary actions.             btnAccent(accent?)
//                (add task, save tracker, save collection)
//
// Resolved inconsistencies (were mixed in the app; picked one default each — override at a
// call site if truly needed):
//   • ghost hover uses `bg-fill-subtle` (some sites used the stronger `bg-fill`).
//   • toggle active carries the accent glow shadow (week days previously used scale only).

// `disabled:opacity-50` is the shared disabled affordance; callers keep native `disabled`
// (which already blocks clicks) and may add `disabled:cursor-not-allowed`.
const base = 'transition-all disabled:opacity-50 cursor-pointer';

// Neutral resting state shared by types 2 & 3 (and type 1's toggled/open state).
const neutralIdle = 'bg-fill-subtle text-fg-faint hover:bg-fill hover:text-fg';

export type Accent = 'accent1' | 'accent2';
// Static (Tailwind-detectable) accent fills + matching glow, per accent. Text is
// `text-canvas` (inverts with the page per theme) to match btnAccent.
const accentFill: Record<Accent, string> = {
  accent1: 'bg-[var(--accent1)] text-canvas',
  accent2: 'bg-[var(--accent2)] text-canvas',
};

// 1 — Ghost: transparent until hover; `active` (toggled/open, e.g. a menu) = filled.
export const btnGhost = (active = false): string =>
  `${base} ${active ? 'bg-fill text-fg' : 'text-fg-subtle hover:text-fg hover:bg-fill-subtle'}`;

// 2 — Neutral: gray fill, hover brightens, stays neutral.
export const btnNeutral = `${base} ${neutralIdle}`;

// 3 — Toggle: neutral by default; `active` = accent fill (+ glow). Defaults to accent2.
export const btnToggle = (active = false, accent: Accent = 'accent2'): string =>
  `${base} ${active ? accentFill[accent] : neutralIdle}`;

// 4 — Accent: always an accent fill. Primary/confirm actions.
export const btnAccent = (accent: Accent = 'accent1'): string =>
  `${base} ${accent === 'accent1' ? 'bg-[var(--accent1)]' : 'bg-[var(--accent2)]'} text-canvas font-bold hover:opacity-90 active:scale-[0.98]`;

// The FIXED role vocabulary — the only hardcoded part of the theme system. These are
// the semantic slots components consume (as Tailwind utilities like `bg-surface`,
// `text-fg`, `text-danger`). Which *color* fills each role is theme data (see
// themes.ts); this file just enumerates the slots so Tailwind can pre-generate the
// utilities (the `@theme` block in index.css must declare one `--color-<role>` per name
// below) and so applyTheme can iterate them.
export const ROLE_NAMES = [
  // Surfaces (elevation) + modal backdrop
  'canvas', 'surface', 'surface-raised', 'overlay', 'scrim',
  // Text emphasis ramp (translucent fg tiers — see docs/theming/token-map.md)
  'fg', 'fg-muted', 'fg-subtle', 'fg-faint', 'fg-ghost',
  // Hairlines (translucent fg; unused solid `line`/`line-strong` repurposed to the ramp)
  'line-subtle', 'line', 'line-strong', 'line-stronger',
  // Translucent neutral fills over content (hover / selected / panel lift)
  'fill-subtle', 'fill', 'fill-strong', 'fill-stronger',
  // Brand accents (note: the user-customizable accent still lives on --accent1/--accent2;
  // these roles are the per-theme default surface for any future `bg-accent` usage)
  'accent', 'accent2',
  // Feedback (solid) + their translucent tint backgrounds
  'danger', 'warning', 'success', 'info',
  'danger-tint', 'warning-tint', 'success-tint', 'info-tint',
  // Task status / priority (Task Planner chips)
  'status-todo', 'status-active', 'status-done',
  'priority-low', 'priority-med', 'priority-high',
  // Relative date buckets (planner grouping headers)
  'date-past', 'date-today', 'date-tomorrow', 'date-next7', 'date-next30', 'date-next3m', 'date-nextyear',
  // XP system
  'xp-tier1', 'xp-tier2', 'xp-bar',
  // Collection pill swatches (their own theme-controlled set)
  'collection-1', 'collection-2', 'collection-3', 'collection-4',
  'collection-5', 'collection-6', 'collection-7', 'collection-8',
] as const;

export type RoleName = typeof ROLE_NAMES[number];

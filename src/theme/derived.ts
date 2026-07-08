import type { RoleName } from './roles';

// Derived roles — the translucent tokens that used to be hardcoded opacities of `fg`
// (`bg-fg/10`, `text-fg/40`, `border-fg/8`…). Instead of a fixed palette color, each is a
// `color-mix` of ANOTHER role var, so it:
//   • auto-inverts per mode — `var(--color-fg)` is white in dark, ink in light, so one
//     definition renders as translucent white (dark) and translucent ink (light);
//   • is theme-agnostic — points at role vars every theme fills, so the same map works for
//     Classic, Gruvbox, and any future theme (spread into each theme's `roles`).
// These are DIRECT role values (not palette color names) — see the resolver in
// applyTheme.ts and the two-form `roles` contract in themes.ts. The dark rendering of each
// reproduces the exact `fg @ N%` the app used before the token migration (zero dark
// regression). Only the ALPHAS are tuned per mode later (light fills want a lower alpha —
// black-on-white reads heavier than white-on-black; light text wants a higher one).
//
// See docs/theming/token-map.md for how each token maps back to the old opacity utilities.

const fg = (pct: number) => `color-mix(in srgb, var(--color-fg) ${pct}%, transparent)`;
const tint = (role: string, pct: number) =>
  `color-mix(in srgb, var(--color-${role}) ${pct}%, transparent)`;

// Covers exactly the derived roles. A theme provides the REST (BaseRole) and spreads this
// in — see themes.ts. `satisfies` gives DERIVED_ROLES an exact-key literal type (so
// DerivedRole below is precise) while still checking every key is a real RoleName.
export const DERIVED_ROLES = {
  // Fills (over content) — was bg-fg/{5,10,15,20}
  'fill-subtle': fg(5),
  fill: fg(10),
  'fill-strong': fg(15),
  'fill-stronger': fg(20),
  // Text ramp — fg stays opaque (theme palette); the rest are translucent fg %
  'fg-muted': fg(75),   // was text-fg/{65..80}
  'fg-subtle': fg(55),  // was text-fg/{45..60}
  'fg-faint': fg(40),   // was text-fg/{35,40}
  'fg-ghost': fg(25),   // was text-fg/{15..30}
  // Hairlines — was border-fg/{5,8,10,20,40}
  'line-subtle': fg(6),
  line: fg(10),
  'line-strong': fg(20),
  'line-stronger': fg(40),
  // Semantic tint backgrounds — was bg-danger/10, bg-warning/*
  'danger-tint': tint('danger', 12),
  'warning-tint': tint('warning', 10),
  'success-tint': tint('success', 12),
  'info-tint': tint('info', 12),
} satisfies Partial<Record<RoleName, string>>;

// The roles supplied by DERIVED_ROLES, and its complement — the "base" roles a theme must
// map to palette colors itself. A theme's own map is typed `Record<BaseRole, string>`, so
// forgetting a base role is a compile error and the merge with DERIVED_ROLES provably
// covers every RoleName.
export type DerivedRole = keyof typeof DERIVED_ROLES;
export type BaseRole = Exclude<RoleName, DerivedRole>;

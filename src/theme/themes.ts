import type { RoleName } from './roles';
import { classic } from './classic';
import { gruvboxMaterial } from './gruvbox';

// ─────────────────────────────────────────────────────────────────────────────
// THE THEME FILE. A theme owns BOTH layers:
//   • colors: an arbitrary palette (colorName -> hex) — define as many as you want.
//   • roles:  the fixed RoleName vocabulary assigned to color names (role -> colorName).
// Nothing about which color fills which role is hardcoded in the system — it's all
// here. To add/reskin a theme, add a Theme object to THEMES below. To retheme a role
// app-wide, change one line in a `roles` map.
//
// A theme has a `dark` and `light` variant. The two usually share the same `roles`
// map (only the hexes differ), so we define the role map once per theme and reuse it.
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeVariant {
  colors: Record<string, string>;    // Layer 1: colorName -> hex
  // Layer 2: role -> EITHER a Layer-1 color name (indirect, reusable palette color) OR a
  // literal CSS value used directly (`role: '#abc'`, or a color-mix). applyTheme's
  // resolveRole disambiguates by membership in `colors`. Direct values suit one-off or
  // derived tokens that aren't reusable palette entries (see theme/derived.ts). Must cover
  // every RoleName — themes build this as `{ ...base, ...DERIVED_ROLES }`.
  roles: Record<RoleName, string>;
}

export interface Theme {
  id: string;
  name: string;
  dark: ThemeVariant;
  light: ThemeVariant;
}

// ── Theme #1: "Classic" — the current app colors, captured as data ───────────────
// Dark values reproduce today's look 1:1. Light values are a light rendering of the
// same palette (tunable).

export const THEMES: Theme[] = [classic, gruvboxMaterial];

export const DEFAULT_THEME_ID = 'classic';

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

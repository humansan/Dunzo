import type { RoleName } from './roles';
import { classic } from './classic';

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
  roles: Record<RoleName, string>;   // Layer 2: role -> colorName (must cover every RoleName)
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

// Gruvbox Material is added in a later step (see docs/THEMING_PLAN.md §4).
export const THEMES: Theme[] = [classic];

export const DEFAULT_THEME_ID = 'classic';

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

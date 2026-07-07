import type { RoleName } from './roles';

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

const classicRoles: Record<RoleName, string> = {
  canvas: 'canvas',
  surface: 'surface',
  'surface-raised': 'raised',
  overlay: 'overlay',
  scrim: 'black',
  fg: 'fg',
  'fg-muted': 'muted',
  'fg-subtle': 'subtle',
  line: 'fg',
  'line-strong': 'fg',
  accent: 'accent',
  accent2: 'accent',
  danger: 'red',
  warning: 'amber',
  success: 'emerald',
  info: 'blue',
  'status-todo': 'subtle',
  'status-active': 'blue',
  'status-done': 'emerald',
  'priority-low': 'subtle',
  'priority-med': 'orange',
  'priority-high': 'red',
  'date-past': 'red',
  'date-today': 'emerald',
  'date-tomorrow': 'blue',
  'date-next7': 'violet',
  'date-next30': 'sky',
  'date-next3m': 'orange',
  'date-nextyear': 'slate',
  'xp-gold': 'amber',
  'xp-tier2': 'violet',
  'xp-bar': 'coral',
  'collection-1': 'coll1',
  'collection-2': 'coll2',
  'collection-3': 'coll3',
  'collection-4': 'coll4',
  'collection-5': 'coll5',
  'collection-6': 'coll6',
  'collection-7': 'coll7',
  'collection-8': 'coll8',
};

const classicDark: Record<string, string> = {
  canvas: '#0a0a0a',
  surface: '#1a1a1a',
  raised: '#222222',
  overlay: '#2a2a2a',
  black: '#000000',
  fg: '#ffffff',
  muted: '#9ca3af',
  subtle: '#6b7280',
  accent: '#c6dabe',
  red: '#d93d42',
  amber: '#ffba44',
  emerald: '#22c55e',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  orange: '#f59e0b',
  slate: '#64748b',
  coral: '#ff723a',
  // Collection swatches (current 8, Tailwind-400 family)
  coll1: '#9ca3af', coll2: '#f87171', coll3: '#fb923c', coll4: '#fbbf24',
  coll5: '#4ade80', coll6: '#2dd4bf', coll7: '#60a5fa', coll8: '#c084fc',
};

const classicLight: Record<string, string> = {
  canvas: '#ffffff',
  surface: '#f5f5f5',
  raised: '#e8e8e8',
  overlay: '#ececec',
  black: '#000000',
  fg: '#0a0a0a',
  muted: '#6b7280',
  subtle: '#9ca3af',
  accent: '#6f9c78',
  red: '#c62f34',
  amber: '#d9932a',
  emerald: '#16a34a',
  blue: '#2563eb',
  violet: '#7c3aed',
  sky: '#0284c7',
  orange: '#d97706',
  slate: '#475569',
  coral: '#ea580c',
  // Collection swatches darkened one step for AA on white
  coll1: '#6b7280', coll2: '#ef4444', coll3: '#ea580c', coll4: '#d97706',
  coll5: '#16a34a', coll6: '#0d9488', coll7: '#2563eb', coll8: '#9333ea',
};

const classic: Theme = {
  id: 'classic',
  name: 'Classic',
  dark: { colors: classicDark, roles: classicRoles },
  light: { colors: classicLight, roles: classicRoles },
};

// Gruvbox Material is added in a later step (see docs/THEMING_PLAN.md §4).
export const THEMES: Theme[] = [classic];

export const DEFAULT_THEME_ID = 'classic';

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

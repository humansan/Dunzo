import type { RoleName } from './roles';
import { Theme, RoleValue } from './themes';

// Shared by both variants for now; alphas are the dark seeds (= today's values, so dark is
// unchanged). `['fg', N]` auto-inverts to translucent ink in light. Light gets its own
// tuning pass later (either a separate role map or opaque-gray text overrides).
const classicRoles: Record<RoleName, RoleValue> = {
  canvas: 'canvas',
  surface: 'surface',
  'surface-raised': 'raised',
  overlay: 'overlay',
  scrim: 'black',
  fg: 'fg',
  // Text emphasis ramp — translucent fg (collapses the old text-fg/NN zoo)
  'fg-muted': ['fg', 80],
  'fg-subtle': ['fg', 65],
  'fg-faint': ['fg', 50],
  'fg-ghost': ['fg', 35],
  // Hairlines — translucent fg
  'line-subtle': ['fg', 6],
  line: ['fg', 10],
  'line-strong': ['fg', 20],
  'line-stronger': ['fg', 40],
  // Neutral fills — translucent fg
  'fill-subtle': ['fg', 5],
  fill: ['fg', 10],
  'fill-strong': ['fg', 15],
  'fill-stronger': ['fg', 20],
  accent: 'accent1',
  accent2: 'accent2',
  danger: 'red',
  warning: 'amber',
  success: 'emerald',
  info: 'blue',
  // Feedback tint backgrounds — translucent hue
  'danger-tint': ['red', 12],
  'warning-tint': ['amber', 10],
  'success-tint': ['emerald', 12],
  'info-tint': ['blue', 12],
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
  'xp-tier1': 'gold',
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

// Light gets its OWN role map: same color assignments as dark, but the translucent tokens
// carry light-tuned alphas. Fills are *lower* than dark (black-on-white reads heavier than
// white-on-black); lines a touch higher (borders must read on white); text a touch higher
// for contrast. Solid roles (surfaces, hues, accents) inherit from classicRoles and pick up
// their light hexes from classicLight below. See docs/theming/token-map.md §4.3a.
const classicLightRoles: Record<RoleName, RoleValue> = {
  ...classicRoles,
  // Text emphasis ramp (translucent near-black fg)
  'fg-muted': ['fg', 90],
  'fg-subtle': ['fg', 80],
  'fg-faint': ['fg', 70],
  'fg-ghost': ['fg', 60],
  // Hairlines
  'line-subtle': ['fg', 7],
  line: ['fg', 11],
  'line-strong': ['fg', 16],
  'line-stronger': ['fg', 28],
  // Neutral fills (gentler than dark)
  'fill-subtle': ['fg', 5],
  fill: ['fg', 9],
  'fill-strong': ['fg', 12],
  'fill-stronger': ['fg', 15],
  // Feedback tints
  'danger-tint': ['red', 10],
  'warning-tint': ['amber', 12],
  'success-tint': ['emerald', 10],
  'info-tint': ['blue', 10],
};

const classicDark: Record<string, string> = {
  canvas: '#111111',
  surface: '#1a1a1a',
  raised: '#222222',
  overlay: '#2a2a2a',
  black: '#000000',
  fg: '#ffffff',
  muted: '#9ca3af',
  subtle: '#6b7280',
  accent1: '#e1e354',
  accent2: '#c6dabe',
  red: '#d93d42',
  gold: '#ffc24b',
  amber: '#ffba44',
  emerald: '#22c55e',
  blue: '#3b82f6',
  violet: '#a78bfa',
  sky: '#0ea5e9',
  orange: '#f59e0b',
  slate: '#64748b',
  coral: '#ff723a',
  // Collection swatches (current 8, Tailwind-400 family)
  coll1: '#9ca3af', coll2: '#f87171', coll3: '#fb923c', coll4: '#fbbf24',
  coll5: '#4ade80', coll6: '#2dd4bf', coll7: '#60a5fa', coll8: '#c084fc',
};

const classicLight: Record<string, string> = {
  // Elevation ASCENDS to white: canvas is a soft gray page (furthest back); each step up
  // the stack brightens toward white so cards/menus separate from the page and read as
  // raised (opposite of dark, where elevation lightens up from black). Depth also comes
  // from the line hairlines + shadows.
  canvas: '#efefef',   // page (soft gray)
  surface: '#f5f5f5',  // cards / panels / sidebars
  raised: '#fafbfc',   // raised cards / inputs
  overlay: '#ffffff',  // menus / popovers / modals (top of the stack)
  black: '#000000',
  fg: '#000000',       // near-black primary text (softer than pure #000)
  muted: '#3f4652',   // (legacy solid; text ramp now uses translucent fg)
  subtle: '#5b6472',  // still used by status-todo / priority-low chips
  accent1: '#81a400', // olive-gold — balances readable-as-text vs black-text-on-accent-bg
  accent2: '#6c8c83', // medium green — same balance
  red: '#d42d33',
  gold: '#e7a829',    // XP signature gold, deepened to read on white
  amber: '#a86616',
  emerald: '#0f8a4c',
  blue: '#2563eb',
  violet: '#7c3aed',
  sky: '#0369a1',
  orange: '#c2570a',
  slate: '#475569',
  coral: '#d1490f',
  // Collection swatches, saturated enough to read on white
  coll1: '#6b7280', coll2: '#dc2626', coll3: '#ea580c', coll4: '#ca8a04',
  coll5: '#16a34a', coll6: '#0d9488', coll7: '#2563eb', coll8: '#9333ea',
};

export const classic: Theme = {
  id: 'classic',
  name: 'Classic',
  dark: { colors: classicDark, roles: classicRoles },
  light: { colors: classicLight, roles: classicLightRoles },
};
import type { RoleName } from './roles';
import { DERIVED_ROLES, type BaseRole } from './derived';
import { Theme } from './themes';

// Palette-referencing roles only. The translucent ramp roles (fills, text tiers, lines,
// tints) come from DERIVED_ROLES — see the merge below and docs/theming/token-map.md.
const classicBase: Record<BaseRole, string> = {
  canvas: 'canvas',
  surface: 'surface',
  'surface-raised': 'raised',
  overlay: 'overlay',
  scrim: 'black',
  fg: 'fg',
  accent: 'accent1',
  accent2: 'accent2',
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

const classicRoles: Record<RoleName, string> = { ...classicBase, ...DERIVED_ROLES };

const classicDark: Record<string, string> = {
  canvas: '#0a0a0a',
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
  // Grayish page so white cards/menus separate and shadows read; elevation gets
  // *brighter* toward white (opposite of dark, where it gets lighter from black).
  canvas: '#ffffff',
  surface: '#eceef2',
  raised: '#f4f6f9',
  overlay: '#e4e7ec',
  black: '#000000',
  fg: '#000000',
  muted: '#3f4652',   // secondary text — strong contrast on white (~8:1)
  subtle: '#5b6472',  // tertiary text (~5:1)
  accent1: '#7a7d12', // olive-gold — balances readable-as-text vs black-text-on-accent-bg
  accent2: '#3f8f63', // medium green — same balance
  red: '#c62f34',
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
  light: { colors: classicLight, roles: classicRoles },
};
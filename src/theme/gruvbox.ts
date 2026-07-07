import type { RoleName } from './roles';
import { Theme } from './themes';

// ── Theme #2: "Gruvbox Material" ─────────────────────────────────────────────
// Roles reference Gruvbox's own color names (bg0, aqua, …). Dark values are the
// canonical Gruvbox Material Dark palette; light values are Gruvbox Material Light
// (medium background), tunable.

const gruvboxRoles: Record<RoleName, string> = {
  canvas: 'bg0',
  surface: 'bg1',
  'surface-raised': 'bg3',
  overlay: 'bg2',
  scrim: 'black',
  fg: 'fg0',
  'fg-muted': 'grey2',
  'fg-subtle': 'grey1',
  line: 'fg0',
  'line-strong': 'fg0',
  accent: 'aqua',
  accent2: 'green',
  danger: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue',
  'status-todo': 'grey1',
  'status-active': 'blue',
  'status-done': 'green',
  'priority-low': 'grey1',
  'priority-med': 'yellow',
  'priority-high': 'red',
  'date-past': 'red',
  'date-today': 'green',
  'date-tomorrow': 'blue',
  'date-next7': 'purple',
  'date-next30': 'aqua',
  'date-next3m': 'orange',
  'date-nextyear': 'grey1',
  'xp-tier1': 'yellow',
  'xp-tier2': 'purple',
  'xp-bar': 'orange',
  'collection-1': 'grey1',
  'collection-2': 'red',
  'collection-3': 'orange',
  'collection-4': 'yellow',
  'collection-5': 'green',
  'collection-6': 'aqua',
  'collection-7': 'blue',
  'collection-8': 'purple',
};

const gruvboxDark: Record<string, string> = {
  bg0: '#1d2021',
  bg1: '#282828',
  bg2: '#32302f',
  bg3: '#3c3836',
  black: '#000000',
  fg0: '#d4be98',
  grey1: '#928374',
  grey2: '#a89984',
  red: '#ea6962',
  orange: '#e78a4e',
  yellow: '#d8a657',
  green: '#a9b665',
  aqua: '#89b482',
  blue: '#7daea3',
  purple: '#d3869b',
};

const gruvboxLight: Record<string, string> = {
  // Authentic Gruvbox Material Light (medium) — values from docs/gruvbox-material-light.json.
  // Cards sit a step darker than the cream page (matches the app's light-mode direction);
  // depth comes from the warm border + shadow.
  bg0: '#fbf1c7', // page (editor.background)
  bg1: '#f2e5bc', // surface / cards / menus (widget/panel/statusline bg)
  bg2: '#ece1b6', // overlay / hover
  bg3: '#e8dcae', // raised / inputs
  black: '#000000',
  fg0: '#654735', // dark-brown text
  grey1: '#928374', // subtle (tertiary — descriptionForeground)
  grey2: '#7c6f64', // muted (secondary — darker, statusBar fg)
  red: '#c14a4a',
  orange: '#c35e0a',
  yellow: '#b47109',
  green: '#6c782e',
  aqua: '#4c7a5d',
  blue: '#45707a',
  purple: '#945e80',
};

export const gruvboxMaterial: Theme = {
  id: 'gruvbox',
  name: 'Gruvbox Material',
  dark: { colors: gruvboxDark, roles: gruvboxRoles },
  light: { colors: gruvboxLight, roles: gruvboxRoles },
};

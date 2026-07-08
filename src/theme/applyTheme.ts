import { ROLE_NAMES, type RoleName } from './roles';
import { getTheme } from './themes';

// Dark / light / follow-OS. Persisted in user settings (see data/settings.ts) and
// reflected onto CSS variables here.
export type ThemeMode = 'dark' | 'light' | 'system';

const BOOT_KEY = 'theme-boot';

export const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

// A role value is either a Layer-1 color NAME (→ indirect through its --c-<name> var) or a
// literal CSS value used directly (a hex, or a color-mix like the DERIVED_ROLES tokens).
// Disambiguated by membership in the theme's `colors` map — literals are always CSS syntax
// (#…, color-mix(…), var(…)), so they never collide with a bare color-name identifier.
function resolveRole(value: string, colors: Record<string, string>): string {
  return value in colors ? `var(--c-${value})` : value;
}

// The effective dark/light for a mode ('system' resolves against the OS).
export function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  return mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;
}

// Write both token layers onto <html>:
//   • Layer 1 colors  → --c-<name>
//   • Layer 2 roles   → --color-<role>: var(--c-<colorName>)
// Utilities reference var(--color-<role>) (declared in index.css @theme), so overriding
// these inline styles on documentElement reskins the whole app. Does NOT touch
// --accent1/--accent2 (the user-customizable accent lives there, applied separately).
export function applyTheme(themeId: string | undefined, mode: ThemeMode): void {
  const theme = getTheme(themeId);
  const resolved = resolveMode(mode);
  const variant = theme[resolved];
  const root = document.documentElement;

  for (const [name, hex] of Object.entries(variant.colors)) {
    root.style.setProperty(`--c-${name}`, hex);
  }
  for (const role of ROLE_NAMES) {
    root.style.setProperty(`--color-${role}`, resolveRole(variant.roles[role as RoleName], variant.colors));
  }
  // The app's brand accents are now theme-owned (no longer user-editable). Point the
  // legacy --accent1/--accent2 vars (used throughout the app) at the theme's accent
  // roles so every `var(--accent1/2)` follows the active theme + mode.
  root.style.setProperty('--accent1', resolveRole(variant.roles.accent, variant.colors));
  root.style.setProperty('--accent2', resolveRole(variant.roles.accent2, variant.colors));
  root.classList.toggle('dark', resolved === 'dark');
  // Drives native form controls (date/time pickers, scrollbars) to match the theme,
  // replacing the per-input `style={{ colorScheme: 'dark' }}` the app used to hardcode.
  root.style.colorScheme = resolved;

  // Snapshot the critical values for the pre-paint bootstrap in index.html, so a
  // reload doesn't flash the @theme defaults (Classic dark) before React runs.
  try {
    localStorage.setItem(
      BOOT_KEY,
      JSON.stringify({
        dark: resolved === 'dark',
        canvas: variant.colors[variant.roles.canvas],
        fg: variant.colors[variant.roles.fg],
      })
    );
  } catch {
    /* localStorage unavailable — ignore */
  }
}

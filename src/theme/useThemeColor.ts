import { useEffect, useState } from 'react';
import { useAppData } from '../data/AppDataContext';

// Read the *concrete* resolved color of a role. getComputedStyle on the custom property
// returns its literal value (`var(--c-…)`), not the resolved color, so we read it off a
// hidden probe element's computed `color`.
function readColor(role: string): string {
  if (typeof document === 'undefined' || !document.body) return '';
  const probe = document.createElement('span');
  probe.style.color = `var(--color-${role})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color; // e.g. "rgb(216, 166, 87)"
  document.body.removeChild(probe);
  return c;
}

// Resolve a theme role (e.g. 'xp-tier1', 'fg', 'fg-muted') to its concrete computed color,
// for the few contexts that can't consume a CSS var: recharts SVG attributes and inline
// `color-mix(... ${c} ...)` / shadow strings. Recomputes when the theme/mode changes.
export function useThemeColor(role: string): string {
  const { themeId, mode } = useAppData();
  const [color, setColor] = useState(() => readColor(role));
  useEffect(() => {
    setColor(readColor(role));
  }, [role, themeId, mode]);
  return color;
}

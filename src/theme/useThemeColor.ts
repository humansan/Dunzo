import { useMemo } from 'react';
import { useAppData } from '@/lib/app-data';
import { resolveRoleColor } from './applyTheme';
import type { RoleName } from './roles';

// Resolve a theme role (e.g. 'xp-tier1', 'fg', 'fg-muted') to its concrete color for the
// few contexts that can't consume a CSS var: recharts SVG attributes and inline
// `${c}`-concatenated shadow strings.
//
// Resolved *synchronously from theme data* (not by probing the DOM). The previous version
// read getComputedStyle inside a useEffect, which lagged one render on theme change: child
// effects run before AppDataContext's applyTheme effect, so the probe saw the OLD CSS vars
// until the next render/refresh (the XP-bar-doesn't-update-until-refresh bug). Computing
// from data makes it correct on first render and in the same render as the change.
export function useThemeColor(role: RoleName): string {
  const { themeId, mode } = useAppData();
  return useMemo(() => resolveRoleColor(themeId, mode, role), [themeId, mode, role]);
}

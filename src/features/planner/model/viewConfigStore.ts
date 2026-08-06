import { MENU_SLICES, ToolbarMenuKey, ColKey, FilterRule, FilterMatch } from '@/features/planner/types';
import { defaultKeyFor } from '@/lib/query/settings';

// Pure transformations over the `hubViews` blob (the DB-synced record of every
// planner view's config, keyed `${workspaceId}:${viewId}`). Kept out of
// useHubViewConfig so the part that rewrites EVERY stored record can be reasoned
// about - and tested - without React or the settings pipeline.

// The reserved view-id slot holding a workspace's defaults - written by "Set for
// all" here, and by the first-run seed in @/lib/onboarding. Defined with the
// settings blob it keys into (see @/lib/query/settings) and re-exported here so
// planner code keeps importing it from its own model layer.
export { DEFAULT_VIEW_ID, defaultKeyFor } from '@/lib/query/settings';

export type ViewsConfig = Record<string, any>;

/**
 * Resolve one view's filter slice: its own record on top of the workspace default,
 * with the default's filters dropped entirely for a view that opts out
 * (ViewDef.ignoresDefaultFilters - Archived and Completed, which exist to show
 * exactly what the shipped default filter excludes).
 *
 * Pure and per-view-id, because the sidebar has to resolve this for EVERY tab, not
 * just the one on screen: a badge counted with the current tab's filters would be a
 * different wrong answer. useHubViewConfig uses it for the visible view too, so the
 * two paths can't drift.
 */
// "Hide completed tasks" used to be seeded as an ordinary rule in the workspace
// default. It reads identically, so an account that predates the setting is
// migrated here, at READ time: the rule is recognised, dropped from the editable
// list, and re-expressed as the flag. No write, idempotent, and it covers every
// workspace and view at once - including records an older client writes later.
//
// The one lossy case: a rule a user typed by hand that happens to match this exact
// shape becomes the locked setting. The intent is the same, so that seemed a fair
// trade against a migration that has to enumerate views to rewrite them.
const isHideCompletedRule = (r: FilterRule) =>
  r.field === 'status' &&
  r.condition === 'is_not' &&
  r.value.trim().toLowerCase() === 'completed';

export interface ViewFilterState {
  filters: FilterRule[];
  filterMatch: FilterMatch;
  // Applied ON TOP of `filters`, ANDed with the whole expression rather than
  // joined into it - see applyFilters. A rule in the list would be subject to
  // `filterMatch`, so flipping the match to Or would let completed tasks back in
  // while the switch still read "on".
  hideCompleted: boolean;
}

export function resolveViewFilters(
  viewsConfig: ViewsConfig,
  workspaceId: string,
  viewId: string,
  ignoresDefaultFilters = false
): ViewFilterState {
  const def = ignoresDefaultFilters ? {} : (viewsConfig[defaultKeyFor(workspaceId)] ?? {});
  const own = viewsConfig[`${workspaceId}:${viewId}`] ?? {};
  const raw = { ...def, ...own };
  const stored: FilterRule[] = Array.isArray(raw.filters) ? (raw.filters as FilterRule[]) : [];
  const legacy = stored.some(isHideCompletedRule);
  return {
    filters: legacy ? stored.filter((r) => !isHideCompletedRule(r)) : stored,
    filterMatch: raw.filterMatch === 'or' ? 'or' : 'and',
    // ON unless something explicitly turns it off. A CODE default, not a seeded
    // one: seeding it into the workspace's default record made the behaviour
    // depend on a write having succeeded, so it was missing for accounts that
    // predate the setting, for any SECOND workspace (the seed only ever writes the
    // first one's record), and for anyone whose signup-time settings PUT failed -
    // all silently, and all unfixable without another write.
    //
    // A view that opts out of inherited filters opts out of this too, or the
    // Archived and Completed tabs - which exist to show exactly what it hides -
    // would come up empty. There, it only applies if that view sets it itself.
    hideCompleted: ignoresDefaultFilters
      ? own.hideCompleted === true
      : raw.hideCompleted !== false,
  };
}

/**
 * Apply one menu's settings to every view in a workspace.
 *
 * Rather than fanning out a write to each view - which would miss views never
 * visited and views not yet created, and would keep resurrecting stale keys for
 * deleted collections - this writes the workspace default and DELETES that
 * menu's slice from every per-view record, so nothing shadows it. Records left
 * empty are dropped, which incidentally garbage-collects dead collection keys.
 *
 * `keepGroupByOn` handles the one view that declares its own grouping: its
 * intrinsic default outranks the broadcast, so without an explicit override the
 * page the user is standing on would snap back the instant they clicked. Passing
 * the current view key there preserves their choice as a partial record.
 */
export function broadcastMenuConfig(
  prev: ViewsConfig,
  opts: {
    workspaceId: string;
    menu: ToolbarMenuKey;
    /** The values to become the workspace default, already serialized. */
    slice: Record<string, unknown>;
    /** View key that must keep an explicit `sections.groupBy` override, if any. */
    keepGroupByOn?: { viewKey: string; groupBy: ColKey };
  },
): ViewsConfig {
  const { workspaceId, menu, slice, keepGroupByOn } = opts;
  const fields = MENU_SLICES[menu];
  const defaultKey = defaultKeyFor(workspaceId);

  const next: ViewsConfig = {};
  for (const [key, rec] of Object.entries(prev)) {
    // Other workspaces keep their own defaults and overrides untouched.
    if (!key.startsWith(`${workspaceId}:`)) { next[key] = rec; continue; }
    if (key === defaultKey) continue;              // rebuilt below
    if (!rec || typeof rec !== 'object') continue; // drop corrupt entries
    const rest: Record<string, any> = { ...rec };
    for (const f of fields) delete rest[f];
    if (Object.keys(rest).length) next[key] = rest;
  }

  next[defaultKey] = { ...(prev[defaultKey] ?? {}), ...slice };

  if (keepGroupByOn) {
    next[keepGroupByOn.viewKey] = {
      ...(next[keepGroupByOn.viewKey] ?? {}),
      sections: { groupBy: keepGroupByOn.groupBy },
    };
  }
  return next;
}

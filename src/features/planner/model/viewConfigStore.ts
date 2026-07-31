import { MENU_SLICES, ToolbarMenuKey, ColKey } from '@/features/planner/types';
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

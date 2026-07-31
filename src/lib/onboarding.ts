import type { Tracker } from '@shared/types';
import { defaultKeyFor, type UserSettings } from '@/lib/query/settings';

// ── First-run seeding ────────────────────────────────────────────────────────
// A brand-new account otherwise lands on a completely empty app - no tasks, no
// widgets, nothing to react to. These seeds give it something to show AND double
// as onboarding: the two time widgets demonstrate what a tracker is and that the
// primary/secondary readouts are configurable, without any tour UI.
//
// Seeded exactly once, from the same first-run branch that creates the "Personal"
// workspace (see app-data.tsx). That branch only fires when the account has NO
// workspace at all, so deleting these widgets later never brings them back.

// The color the Add Tracker modal starts on, so a seeded widget is indistinguishable
// from one the user creates by hand and immediately accepts.
const SEED_COLOR = '#c6dabe';
const SEED_PRECISION = 2;

const newId = () => Math.random().toString(36).substr(2, 9);

export function buildSeedTrackers(): Tracker[] {
  const createdAt = Date.now();
  return [
    {
      id: newId(),
      name: 'Day',
      type: 'day',
      color: SEED_COLOR,
      precision: SEED_PRECISION,
      displayMode: 'time_remaining',
      secondaryDisplayMode: 'percent_elapsed',
      createdAt,
    },
    {
      id: newId(),
      name: 'Year',
      type: 'year',
      color: SEED_COLOR,
      precision: SEED_PRECISION,
      displayMode: 'percent_elapsed',
      secondaryDisplayMode: 'time_remaining',
      createdAt,
    },
  ];
}

// ── Default view config ──────────────────────────────────────────────────────
// Every planner view (including collections created later, and views never
// visited) falls back to the workspace's default record when it has no config of
// its own - the same slot the toolbar's "Set for all" writes. Seeding it is
// therefore all it takes to give the whole planner a starting filter.
//
// That filter is "Status is not Completed", which is what makes finished work
// disappear from the planner now that auto-archive is off by default. Unlike
// auto-archive it is a read-time rule, so it behaves identically whether the task
// was ticked off in the Planner, the daily list, or the calendar.
export function buildSeedViewsConfig(workspaceId: string): NonNullable<UserSettings['hubViews']> {
  return {
    [defaultKeyFor(workspaceId)]: {
      // Shape must match the planner's FilterRule. `value` is matched against the
      // field's DISPLAY value (see matchesFilter), i.e. the STATUS_OPTIONS label
      // rather than the stored 'completed' - the comparison is case-insensitive.
      filters: [{ id: newId(), field: 'status', condition: 'is_not', value: 'Completed' }],
      filterMatch: 'and',
    },
    // The Archived view is exempt: archived tasks are usually completed ones, so
    // the default filter would render that view permanently empty. An explicit
    // per-view record shadows the workspace default. (Using "Set for all" on
    // filters later clears this, by design - that action means all.)
    [`${workspaceId}:archived`]: { filters: [], filterMatch: 'and' },
  };
}

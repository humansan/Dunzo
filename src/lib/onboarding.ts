import type { Tracker } from '@shared/types';

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

// ── No seeded view config ────────────────────────────────────────────────────
// There used to be one, writing the planner's default record so completed tasks
// were hidden out of the box. That is a CODE default now (resolveViewFilters:
// `hideCompleted` is on unless something turns it off), because a seeded one only
// held for accounts where the write actually happened: not for accounts created
// before the setting existed, not for a second workspace (the seed only ever
// wrote the first one's record), and not if the signup-time settings PUT failed.
// Defaults belong in the resolver, where every view goes through them.

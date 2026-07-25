/**
 * Site-wide constants. Nav, footer, and CTAs all read from here so a link changes
 * in exactly one place.
 */

/** The app itself. Every "Start free" and "Sign in" points into it. */
export const APP_URL = '/app/login';

export const GITHUB_URL = 'https://github.com/humansan/Dunzo';

export const TAGLINE = 'Plan big. Win the day.';

export const SUBHEAD =
  'Dunzo pairs a strategic planner and calendar for the big picture with a daily list that keeps you focused on today. Finish it to earn XP, stars, and keep the streak alive.';

/** Primary nav — the three interior pages, in visit order. */
export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/start', label: 'Get started' },
] as const;

/**
 * Footer columns. The "Product" deep links are anchors into /features; those
 * section ids get created in Phase 6.
 */
export const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/features#daily', label: 'The daily list' },
      { href: '/features#planner', label: 'The planner' },
      { href: '/features#xp', label: 'XP & streaks' },
    ],
  },
  {
    heading: 'More',
    links: [
      { href: '/start', label: 'Get started' },
      { href: APP_URL, label: 'Sign in' },
      { href: GITHUB_URL, label: 'GitHub', external: true },
    ],
  },
] as const;

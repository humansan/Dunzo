/**
 * Per-route <head> content — the single source of truth for three consumers:
 *
 *   1. the prerender script (phase 2), which bakes each entry into a static HTML file
 *   2. useRouteHead(), which keeps the tab title correct on client-side navigation
 *   3. the sitemap, if it ever outgrows being hand-written
 *
 * Adding a marketing route means adding an entry HERE and to ROUTES in prerender.mjs.
 * Miss the second one and the route works in `vite dev` but 404s in production, because
 * vercel.json no longer has an SPA catch-all to fall back on.
 *
 * See docs/seo/SEO_IMPLEMENTATION_PLAN.md.
 */

export const SITE_URL = 'https://dunzo.work';

export type RouteHead = {
  /** Path only, no origin. The canonical is built as SITE_URL + path. */
  path: string;
  title: string;
  description: string;
  /** Emits <meta name="robots" content="noindex"> and keeps the route out of the sitemap. */
  noindex?: boolean;
};

/** Keyed by pathname, so a lookup is `HEADS[location.pathname]`. */
export const HEADS: Record<string, RouteHead> = {
  '/': {
    path: '/',
    // The tagline stays as the <h1>; the title tag is where the search terms go, since
    // "dunzo" alone is unwinnable against the delivery company of the same name.
    title: 'Dunzo: Task Manager with Daily Focus Lists & XP Streaks',
    description:
      'An intuitive task manager with daily focus lists, planner boards, and a gamified XP & streak system. Free in early access.',
  },
  '/features': {
    path: '/features',
    title: 'Features: Tasks, Planner, Calendar, XP & Focus | Dunzo',
    description:
      'Every Dunzo feature: a task database with filters and grouping, a daily focus list, a shared calendar, XP and streaks, Pomodoro timers, and full-text search.',
  },
  '/404': {
    path: '/404',
    title: 'Page not found | Dunzo',
    description: 'That page does not exist.',
    noindex: true,
  },
};

/** Absolute canonical URL for a route. Trailing-slash-free except at the root. */
export const canonicalFor = (head: RouteHead): string => SITE_URL + head.path;

/** Every route that belongs in the sitemap, in priority order. */
export const INDEXABLE_HEADS: RouteHead[] = Object.values(HEADS).filter((h) => !h.noindex);

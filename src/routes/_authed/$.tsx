import { createFileRoute, redirect } from '@tanstack/react-router';

// Catch-all for URLs that match no real route: extra segments after a section
// (/stats/foo, /trackers/a/b, /settings/x), a mistyped path, a stale link. The
// alternative was a splat file per section, each one a copy of this redirect;
// one route that reads the first segment covers every section, including ones
// added later, and can't drift out of sync with them.
//
// Real routes always outrank a splat, so this only ever sees genuine misses.
// It lives under _authed so an unauthenticated miss still goes through the auth
// boundary to /login rather than bouncing off a redirect first.

const SECTIONS = ['today', 'planner', 'calendar', 'trackers', 'stats', 'settings'] as const;

export const Route = createFileRoute('/_authed/$')({
  beforeLoad: ({ params }) => {
    const first = params._splat?.split('/')[0] ?? '';
    const section = SECTIONS.find((s) => s === first);
    // Land on the section the user was aiming at, or the app's home view when the
    // path names nothing at all. Replace, so Back doesn't return to the dead URL.
    throw redirect({ to: section ? `/${section}` : '/planner', replace: true });
  },
});

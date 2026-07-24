// The app is served under a sub-path (`/app`) beneath the marketing site at the
// domain root. Vite injects that path as `import.meta.env.BASE_URL` (from `base`
// in vite.config.ts), and the router derives its `basepath` from the same value -
// so there's exactly one source of truth for "where the app lives."
//
// `router.navigate()` / `<Link>` prepend the basepath automatically. Raw
// `router.history.push()` and absolute URLs built from `window.location.origin`
// do NOT - they bypass the router's basepath rewrite and hit the browser directly.
// Use `withBase()` for those so they land inside the app instead of at the domain
// root. See docs/routing and website plan §9.

// '/app/' -> '/app', '/' -> '' (so withBase('/x') never double-slashes).
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prepend the app basepath to an internal path (which must start with '/'). */
export function withBase(path: string): string {
  return basePath + path;
}

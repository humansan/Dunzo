/**
 * Outbound destinations shared across the site.
 *
 * The app is served from /app on the same domain (see ../../vercel.json rewrites).
 * It is a *separate* SPA, so every link into it must be a plain <a href>: a
 * react-router <Link> would resolve /app inside this site's router and fall through
 * to the "*" route, rendering the home page instead of loading the app.
 *
 * /app itself redirects to /app/today, which bounces signed-out visitors to
 * /app/login — so it is the right target for both "Get Started" and "Go to App".
 */
export const APP_URL = '/app';

export const GITHUB_URL = 'https://github.com/humansan/Dunzo';

/** Home-page demo video. Hero auto-plays when it sees this hash. */
export const DEMO_HASH = '/#demo';

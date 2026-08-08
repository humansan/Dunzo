import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';

/**
 * Build-time render target for prerender.mjs. Never shipped to the browser.
 *
 * `StaticRouter` lives in `react-router` in v7 — the v6 path `react-router-dom/server`
 * no longer exists, and `react-router-dom` does not re-export it.
 *
 * Nothing here touches the DOM: every browser global in this app sits inside a
 * `useEffect` or an event handler, so `renderToString` is safe without a shim. Keep it
 * that way — a module-scope `window`/`document` access anywhere in the tree breaks the
 * build, not just the render.
 */

/** Re-exported so prerender.mjs can read route metadata out of this one SSR bundle. */
export { HEADS, SITE_URL, canonicalFor } from './seo';

export const render = (url: string): string =>
  renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { HEADS, canonicalFor } from '../seo';

/**
 * Keeps <title> and the canonical link in step with the current route.
 *
 * This is for humans and for client-side navigation only — crawlers request each URL
 * directly and get the prerendered head from the static file, so nothing here is load-
 * bearing for SEO. It exists because without it the tab title stays on whatever route
 * was first loaded, which is wrong the moment anyone clicks "Features".
 *
 * Unknown paths fall back to the 404 entry, matching the catch-all route in App.tsx.
 */
export const useRouteHead = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const head = HEADS[pathname] ?? HEADS['/404'];

    document.title = head.title;

    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', head.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', canonicalFor(head));
  }, [pathname]);
};

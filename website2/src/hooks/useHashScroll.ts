import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * The browser only honors a hash for content that already exists — arriving at
 * `/features#planner` from another route, the section isn't mounted yet when the jump would
 * happen. This re-applies it after render. Sections carry `scroll-mt-28` for the fixed navbar,
 * so `scrollIntoView` lands clear of it.
 */
export const useHashScroll = () => {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, pathname]);
};

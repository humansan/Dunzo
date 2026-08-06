import { useEffect } from 'react';

/**
 * The entrance stagger is pure CSS `animation-delay`, so its clock starts the
 * moment the elements are styled and then runs on wall-clock time — whether or
 * not the user has seen a single painted frame. A page that renders while
 * hidden (background tab, omnibox prerender, "preload top hit") or that stalls
 * its first paint behind image decode burns the front of the timeline, and the
 * animation appears to start halfway through.
 *
 * So the animations ship paused (see `html:not(.anim-ready)` in index.css) and
 * this releases them only once the document is visible and has actually
 * presented a frame. It also re-pauses on hide, so backgrounding the tab
 * mid-stagger resumes where it left off instead of skipping ahead.
 */
export const useAnimationGate = () => {
  useEffect(() => {
    const root = document.documentElement;
    const release = () => root.classList.add('anim-ready');

    // rAF is starved in hidden documents, so this only resolves once we're
    // genuinely on screen. Two frames deep = the first keyframe is composited.
    let failsafe: number | undefined;
    const releaseWhenPainted = () => {
      requestAnimationFrame(() => requestAnimationFrame(release));
      // rAF can still be starved by a long main-thread task; don't hold the
      // page blank on that account.
      failsafe = window.setTimeout(release, 800);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (root.classList.contains('anim-ready')) return;
        releaseWhenPainted();
      } else {
        // Re-pause: the timeline freezes instead of running on unseen.
        root.classList.remove('anim-ready');
        window.clearTimeout(failsafe);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState === 'visible') releaseWhenPainted();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(failsafe);
    };
  }, []);
};
